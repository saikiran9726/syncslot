// SlotSync Frontend API Client Fetch Wrapper
// Translates { error: { code, message, fields } } to structured Error objects.
// Handles timeouts, offline network detection, and CSRF protection.

import { ApiErrorResponse, ErrorCode, ERROR_CODES } from '../../shared/errorCodes';

export class ApiError extends Error {
  code: ErrorCode;
  fields?: Record<string, string>;
  status: number;

  constructor(status: number, code: ErrorCode, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export interface RequestOptions extends RequestInit {
  timeoutMs?: number;
  idempotencyKey?: string;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  // Check online status before executing
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new ApiError(
      0,
      ERROR_CODES.UNAVAILABLE,
      'You are currently offline. Please check your internet connection.'
    );
  }

  const { timeoutMs = 15000, idempotencyKey, headers: customHeaders, ...restOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const headers = new Headers(customHeaders);
  if (!headers.has('Content-Type') && restOptions.body && typeof restOptions.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (idempotencyKey) {
    headers.set('Idempotency-Key', idempotencyKey);
  }

  try {
    const response = await fetch(path, {
      ...restOptions,
      headers,
      signal: controller.signal,
      credentials: 'same-origin', // Include HttpOnly session cookies
    });

    clearTimeout(timeoutId);

    // Parse JSON response body if present
    const contentType = response.headers.get('content-type');
    let data: any = null;
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    }

    if (!response.ok) {
      if (data && data.error) {
        const errPayload = data as ApiErrorResponse;
        throw new ApiError(
          response.status,
          errPayload.error.code,
          errPayload.error.message,
          errPayload.error.fields
        );
      }

      throw new ApiError(
        response.status,
        ERROR_CODES.INTERNAL,
        `Request failed with status ${response.status}`
      );
    }

    return data as T;
  } catch (err: any) {
    clearTimeout(timeoutId);

    if (err instanceof ApiError) {
      throw err;
    }

    if (err.name === 'AbortError') {
      throw new ApiError(
        408,
        ERROR_CODES.UNAVAILABLE,
        'Request timed out. Please try again.'
      );
    }

    throw new ApiError(
      0,
      ERROR_CODES.INTERNAL,
      err.message || 'A network error occurred'
    );
  }
}

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
}

export const apiClient = {
  get: async <T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> => {
    try {
      const data = await apiFetch<T>(path, { ...options, method: 'GET' });
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: err as ApiError };
    }
  },
  post: async <T>(path: string, body?: any, options?: RequestOptions): Promise<ApiResponse<T>> => {
    try {
      const data = await apiFetch<T>(path, {
        ...options,
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: err as ApiError };
    }
  },
  patch: async <T>(path: string, body?: any, options?: RequestOptions): Promise<ApiResponse<T>> => {
    try {
      const data = await apiFetch<T>(path, {
        ...options,
        method: 'PATCH',
        body: body ? JSON.stringify(body) : undefined,
      });
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: err as ApiError };
    }
  },
  put: async <T>(path: string, body?: any, options?: RequestOptions): Promise<ApiResponse<T>> => {
    try {
      const data = await apiFetch<T>(path, {
        ...options,
        method: 'PUT',
        body: body ? JSON.stringify(body) : undefined,
      });
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: err as ApiError };
    }
  },
  delete: async <T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> => {
    try {
      const data = await apiFetch<T>(path, { ...options, method: 'DELETE' });
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: err as ApiError };
    }
  },
};
