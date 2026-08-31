import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, friendlyError } from '@/lib/supabase';
import type { Profile, UserRole } from '@/types/db';

/**
 * Marca que identifica a los usuarios de esta app dentro de la instancia de
 * Auth (que es compartida con otros proyectos). El trigger
 * `tesisreserva.handle_new_user` sólo crea el profile si ve esta marca.
 */
const APP_TAG = 'tesisreserva';

interface SignUpArgs {
  fullName: string;
  email: string;
  password: string;
  role: Extract<UserRole, 'client' | 'owner'>;
}

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  /** true mientras se resuelve la sesión inicial (evita parpadeos de rutas). */
  loading: boolean;
  /** Error al cargar el profile (ej: schema no expuesto). */
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (args: SignUpArgs) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  recoverWithCode: (email: string, code: string, password: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Evita condiciones de carrera entre respuestas de fetch desordenadas. */
  const activeUser = useRef<string | null>(null);

  /**
   * Petición del profile que está en vuelo.
   *
   * Al arrancar, `getSession()` y el evento `INITIAL_SESSION` de
   * `onAuthStateChange` piden los dos el mismo profile, y el orden entre ellos
   * no está garantizado. Guardar la promesa deduplica sin depender de quién
   * llegue primero: la segunda llamada se cuelga de la que ya salió, en vez de
   * abrir otra petición al arranque, que es justo el momento más sensible.
   */
  const perfilEnVuelo = useRef<{ id: string; promesa: Promise<void> } | null>(null);

  /**
   * Copia del profile en el dispositivo.
   *
   * Al abrir la app había que esperar el viaje del profile ANTES de que los
   * guards dejaran renderizar, y recién ahí la pantalla pedía sus datos: dos
   * viajes en fila cada vez. Con la copia local se pinta al instante y el
   * profile fresco se pide igual, en paralelo, corrigiendo lo que haga falta.
   *
   * Es sólo para pintar rápido: NO es una fuente de verdad. Los permisos los
   * decide la base con RLS, así que una copia vieja no habilita nada.
   */
  const CLAVE_PERFIL = 'tesisreserva.perfil';

  const leerPerfilGuardado = (userId: string): Profile | null => {
    try {
      const crudo = localStorage.getItem(CLAVE_PERFIL);
      if (!crudo) return null;
      const guardado = JSON.parse(crudo) as Profile;
      return guardado?.id === userId ? guardado : null;
    } catch {
      return null;
    }
  };

  const guardarPerfil = (p: Profile | null) => {
    try {
      if (p) localStorage.setItem(CLAVE_PERFIL, JSON.stringify(p));
      else localStorage.removeItem(CLAVE_PERFIL);
    } catch {
      // Si el almacenamiento está lleno o bloqueado, se sigue sin caché.
    }
  };

  const loadProfile = useCallback((userId: string, email?: string | null): Promise<void> => {
    const enVuelo = perfilEnVuelo.current;
    if (enVuelo && enVuelo.id === userId) return enVuelo.promesa;

    const promesa = cargarPerfil(userId, email).finally(() => {
      if (perfilEnVuelo.current?.promesa === promesa) perfilEnVuelo.current = null;
    });
    perfilEnVuelo.current = { id: userId, promesa };
    return promesa;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargarPerfil = useCallback(async (userId: string, email?: string | null) => {
    activeUser.current = userId;

    const { data, error: err } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (activeUser.current !== userId) return; // llegó tarde: la ignoramos

    if (err) {
      setError(friendlyError(err, 'No pudimos cargar tu perfil.'));
      setProfile(null);
      return;
    }

    if (data) {
      setError(null);
      setProfile(data as Profile);
      guardarPerfil(data as Profile);
      return;
    }

    /**
     * Red de seguridad: si el trigger no llegó a crear el profile
     * (por ejemplo, una cuenta creada antes de instalar el schema),
     * lo creamos con los metadatos del usuario.
     */
    const { data: userData } = await supabase.auth.getUser();
    const meta = userData.user?.user_metadata ?? {};
    const role: UserRole = meta.role === 'owner' ? 'owner' : 'client';

    const { data: created, error: insertErr } = await supabase
      .from('profiles')
      .upsert(
        {
          id: userId,
          full_name: typeof meta.full_name === 'string' ? meta.full_name : '',
          email: email ?? userData.user?.email ?? null,
          role,
          // Quien se registró como dueño arranca con el modo negocio puesto.
          is_owner: role === 'owner',
          city: typeof meta.city === 'string' && meta.city ? meta.city : 'Asunción',
        },
        { onConflict: 'id' },
      )
      .select()
      .single();

    if (activeUser.current !== userId) return;

    if (insertErr) {
      setError(friendlyError(insertErr, 'No pudimos crear tu perfil.'));
      setProfile(null);
      return;
    }

    setError(null);
    setProfile(created as Profile);
    guardarPerfil(created as Profile);
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);

      const user = data.session?.user;
      if (!user) {
        setLoading(false);
        return;
      }

      // Con la copia local se deja de esperar: la pantalla se pinta y pide sus
      // datos mientras el profile fresco viene en paralelo.
      const guardado = leerPerfilGuardado(user.id);
      if (guardado) {
        setProfile(guardado);
        activeUser.current = user.id;
        setLoading(false);
      }

      void loadProfile(user.id, user.email).finally(() => {
        if (mounted) setLoading(false);
      });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (!mounted) return;
      setSession(next);

      if (!next?.user) {
        activeUser.current = null;
        setProfile(null);
        guardarPerfil(null);
        setError(null);
        return;
      }

      // TOKEN_REFRESHED no cambia de usuario: no hace falta releer el profile.
      if (event === 'TOKEN_REFRESHED' && activeUser.current === next.user.id) return;

      void loadProfile(next.user.id, next.user.email);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (err) {
      if (err.message.includes('Invalid login credentials')) {
        throw new Error('Email o contraseña incorrectos.');
      }
      if (err.message.includes('Email not confirmed')) {
        throw new Error('Confirmá tu email antes de ingresar.');
      }
      throw new Error(friendlyError(err, 'No pudimos iniciar sesión.'));
    }
  }, []);

  const signUp = useCallback(
    async ({ fullName, email, password, role }: SignUpArgs) => {
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            // `app` es lo que hace que el trigger cree el profile en este schema.
            app: APP_TAG,
            full_name: fullName.trim(),
            // El rol se elige UNA sola vez, en el registro.
            role,
            city: 'Asunción',
          },
        },
      });

      if (err) {
        if (err.message.includes('already registered')) {
          throw new Error('Ese email ya tiene una cuenta. Probá iniciar sesión.');
        }
        if (err.message.toLowerCase().includes('password')) {
          throw new Error('La contraseña debe tener al menos 6 caracteres.');
        }
        throw new Error(friendlyError(err, 'No pudimos crear tu cuenta.'));
      }

      // Sin sesión inmediata => la instancia pide confirmación por email.
      return { needsEmailConfirmation: !data.session };
    },
    [],
  );

  const signOut = useCallback(async () => {
    activeUser.current = null;
    setProfile(null);
    guardarPerfil(null);
    await supabase.auth.signOut();
  }, []);

  /**
   * Pide el código de recuperación por correo.
   *
   * No se manda `redirectTo` a propósito. Dentro del APK,
   * `window.location.origin` es `https://localhost` (el servidor interno de
   * Capacitor), así que el enlace del correo apuntaba a una dirección que en
   * el teléfono no existe: se abría el navegador en la nada. Con el código de
   * 6 dígitos la persona nunca sale de la app y no hace falta ningún enlace.
   */
  const resetPassword = useCallback(async (email: string) => {
    const { error: err } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
    );
    if (err) throw new Error(friendlyError(err, 'No pudimos enviar el correo.'));
  }, []);

  /**
   * Canjea el código por una sesión temporal y deja la contraseña nueva.
   *
   * Los dos pasos van juntos a propósito: el código abre una sesión con
   * permisos plenos sobre la cuenta, así que dejarla abierta esperando otra
   * pantalla sería una ventana innecesaria. Si el cambio falla, se cierra.
   */
  const recoverWithCode = useCallback(
    async (email: string, code: string, password: string) => {
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.trim(),
        type: 'recovery',
      });

      if (verifyErr) {
        const m = verifyErr.message.toLowerCase();
        // El servidor contesta lo mismo ("Token has expired or is invalid") sea
        // que el código esté mal o que haya vencido: no distingue a propósito,
        // para no confirmarle a nadie que un código existe. El mensaje tiene
        // que abarcar los dos casos en vez de afirmar uno.
        if (m.includes('expired') || m.includes('invalid') || m.includes('not found')) {
          throw new Error('El código no es correcto o ya venció. Revisalo o pedí uno nuevo.');
        }
        if (m.includes('rate') || m.includes('too many')) {
          throw new Error('Probaste demasiadas veces. Esperá unos minutos.');
        }
        throw new Error(friendlyError(verifyErr, 'No pudimos validar el código.'));
      }

      const { error: passErr } = await supabase.auth.updateUser({ password });
      if (passErr) {
        await supabase.auth.signOut();
        throw new Error(friendlyError(passErr, 'No pudimos cambiar la contraseña.'));
      }
    },
    [],
  );

  const updatePassword = useCallback(async (password: string) => {
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) throw new Error(friendlyError(err, 'No pudimos cambiar la contraseña.'));
  }, []);

  const updateProfile = useCallback(
    async (patch: Partial<Profile>) => {
      if (!session?.user) throw new Error('Sesión no válida.');

      // El rol nunca se cambia desde el frontend (RLS también lo bloquea).
      const { role: _ignoredRole, id: _ignoredId, ...safe } = patch;
      void _ignoredRole;
      void _ignoredId;

      const { data, error: err } = await supabase
        .from('profiles')
        .update(safe)
        .eq('id', session.user.id)
        .select()
        .single();

      if (err) throw new Error(friendlyError(err, 'No pudimos guardar tus datos.'));
      setProfile(data as Profile);
    },
    [session],
  );

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id, session.user.email);
  }, [session, loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading,
      error,
      signIn,
      signUp,
      signOut,
      resetPassword,
      recoverWithCode,
      updatePassword,
      updateProfile,
      refreshProfile,
    }),
    [
      session, profile, loading, error,
      signIn, signUp, signOut, resetPassword, recoverWithCode, updatePassword, updateProfile,
      refreshProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  return ctx;
}
