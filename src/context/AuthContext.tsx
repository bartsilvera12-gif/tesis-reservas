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

  const loadProfile = useCallback(async (userId: string, email?: string | null) => {
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
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        await loadProfile(data.session.user.id, data.session.user.email);
      }
      if (mounted) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (!mounted) return;
      setSession(next);

      if (!next?.user) {
        activeUser.current = null;
        setProfile(null);
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
    await supabase.auth.signOut();
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error: err } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/auth/nueva-clave` },
    );
    if (err) throw new Error(friendlyError(err, 'No pudimos enviar el correo.'));
  }, []);

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
      updatePassword,
      updateProfile,
      refreshProfile,
    }),
    [
      session, profile, loading, error,
      signIn, signUp, signOut, resetPassword, updatePassword, updateProfile, refreshProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  return ctx;
}
