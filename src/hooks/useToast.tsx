import { useCallback, useEffect, useState } from 'react';
import { Toast } from '@/components/ui';

interface ToastState {
  message: string;
  tone: 'success' | 'error';
}

/** Mensajes efímeros de éxito/error. */
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const success = useCallback(
    (message: string) => setToast({ message, tone: 'success' }),
    [],
  );
  const fail = useCallback(
    (message: string) => setToast({ message, tone: 'error' }),
    [],
  );

  const node = toast ? (
    <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />
  ) : null;

  return { success, fail, node };
}
