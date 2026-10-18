export class HttpError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(message: string, status: number, url: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
  }
}

export interface FetchJsonOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  init?: RequestInit;
}

/** `fetch` + JSON con tiempo de espera y errores legibles. */
export async function fetchJson<T>(url: string, { signal, timeoutMs = 15_000, init }: FetchJsonOptions = {}): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: combined });
  } catch (err) {
    if (signal?.aborted) throw err;
    if (timeout.aborted) throw new HttpError('Tiempo de espera agotado', 0, url);
    throw new HttpError('Error de red o CORS', 0, url);
  }
  if (!res.ok) {
    let reason = '';
    try {
      const body = (await res.json()) as { reason?: string; error?: { message?: string } };
      reason = body.reason ?? body.error?.message ?? '';
    } catch {
      // cuerpo no JSON
    }
    throw new HttpError(reason || `HTTP ${res.status}`, res.status, url);
  }
  return (await res.json()) as T;
}

export const isAbortError = (err: unknown) => err instanceof DOMException && err.name === 'AbortError';
