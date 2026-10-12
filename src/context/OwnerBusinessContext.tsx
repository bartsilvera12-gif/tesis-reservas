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
import { useAuth } from './AuthContext';
import { fetchMyBusinesses } from '@/services/businesses';
import type { BusinessWithMeta } from '@/types/db';

interface OwnerBusinessValue {
  businesses: BusinessWithMeta[];
  active: BusinessWithMeta | null;
  setActiveId: (id: string) => void;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

const OwnerBusinessContext = createContext<OwnerBusinessValue | null>(null);

const STORAGE_KEY = 'tesisreserva.activeBusiness';

export function OwnerBusinessProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const ownerId = profile?.id ?? null;

  const [businesses, setBusinesses] = useState<BusinessWithMeta[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Sólo la primera carga es "cargando". Las que vienen después de guardar
   * algo refrescan en silencio: el guardia del panel muestra la pantalla de
   * carga mientras `loading` está activo, y con eso cada guardado desmontaba
   * el panel entero y lo volvía a armar con todas las secciones cerradas.
   */
  const cargoPara = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!ownerId) {
      setBusinesses([]);
      setLoading(false);
      return;
    }
    // Otra cuenta en el mismo teléfono sí arranca de cero.
    if (cargoPara.current !== ownerId) setLoading(true);
    setError(null);
    try {
      const rows = await fetchMyBusinesses(ownerId);
      setBusinesses(rows);
      cargoPara.current = ownerId;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos cargar tus negocios.');
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const setActiveId = useCallback((id: string) => {
    setActiveIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  // Si el id guardado ya no existe (negocio borrado, otra cuenta), caemos al primero.
  const active = useMemo(() => {
    if (!businesses.length) return null;
    return businesses.find((b) => b.id === activeId) ?? businesses[0];
  }, [businesses, activeId]);

  const value = useMemo<OwnerBusinessValue>(
    () => ({ businesses, active, setActiveId, loading, error, reload: load }),
    [businesses, active, setActiveId, loading, error, load],
  );

  return (
    <OwnerBusinessContext.Provider value={value}>{children}</OwnerBusinessContext.Provider>
  );
}

export function useOwnerBusiness(): OwnerBusinessValue {
  const ctx = useContext(OwnerBusinessContext);
  if (!ctx) {
    throw new Error('useOwnerBusiness debe usarse dentro de <OwnerBusinessProvider>.');
  }
  return ctx;
}
