import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Vuelve a ejecutar la consulta (para "Reintentar" y refrescos). */
  reload: () => void;
  /** Actualiza el dato en memoria sin ir al servidor (updates optimistas). */
  setData: (next: T | null | ((prev: T | null) => T | null)) => void;
}

/**
 * Ejecuta una promesa y expone loading / error / data.
 * Cancela los resultados de peticiones viejas para evitar parpadeos.
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[],
  options: { enabled?: boolean } = {},
): AsyncState<T> {
  const enabled = options.enabled ?? true;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const runId = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const id = ++runId.current;
    setLoading(true);
    setError(null);

    fnRef
      .current()
      .then((result) => {
        if (runId.current !== id) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (runId.current !== id) return;
        setError(err instanceof Error ? err.message : 'Algo salió mal.');
      })
      .finally(() => {
        if (runId.current === id) setLoading(false);
      });

    return () => {
      // Invalida esta corrida si las dependencias cambian antes de terminar.
      if (runId.current === id) runId.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return { data, loading, error, reload, setData };
}
