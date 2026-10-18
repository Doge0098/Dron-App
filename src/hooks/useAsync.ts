import { useEffect, useState, type DependencyList } from 'react';
import { isAbortError } from '../services/http';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/** Ejecuta una tarea asíncrona cancelable cada vez que cambian las dependencias. */
export function useAsync<T>(task: ((signal: AbortSignal) => Promise<T>) | null, deps: DependencyList): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: Boolean(task), error: null });
  useEffect(() => {
    if (!task) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const ctrl = new AbortController();
    setState((s) => ({ data: s.data, loading: true, error: null }));
    task(ctrl.signal).then(
      (data) => {
        if (!ctrl.signal.aborted) setState({ data, loading: false, error: null });
      },
      (err: unknown) => {
        if (ctrl.signal.aborted || isAbortError(err)) return;
        const status = (err as { status?: number }).status;
        const message =
          status === 429
            ? 'Límite gratuito de la API alcanzado. Inténtalo más tarde.'
            : err instanceof Error
              ? err.message
              : 'Error desconocido';
        setState({ data: null, loading: false, error: message });
      },
    );
    return () => ctrl.abort();
  }, deps);
  return state;
}
