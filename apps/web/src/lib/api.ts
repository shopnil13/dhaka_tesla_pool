import type { ApiErrorBody, ErrorCode } from '@teslapool/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'NETWORK_ERROR',
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Per-field messages from a 400 VALIDATION_FAILED response. */
  get fieldErrors(): Record<string, string[] | undefined> {
    const details = this.details as { fieldErrors?: Record<string, string[]> } | undefined;
    return details?.fieldErrors ?? {};
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

/**
 * Calls the API through the same-origin /api proxy. Resolves with the JSON
 * body, or throws an ApiError carrying the API's error code and message.
 */
export async function api<T>(path: string, { method, body }: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach Tesla Pool. Check your connection.');
  }

  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const error = (data as ApiErrorBody | null)?.error;
    if (!error && res.status >= 500) {
      // No JSON envelope: the proxy could not reach the API (e.g. a free-tier cold start).
      throw new ApiError(
        res.status,
        'INTERNAL_ERROR',
        'The Tesla Pool server is waking up or unavailable. Try again in a moment.',
      );
    }
    throw new ApiError(
      res.status,
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? `Request failed (${res.status})`,
      error?.details,
    );
  }
  return data as T;
}
