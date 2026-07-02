const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  accessToken?: string;
}

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, accessToken, headers, ...rest } = options;
  const finalHeaders = new Headers(headers);
  if (body !== undefined) finalHeaders.set("Content-Type", "application/json");
  if (accessToken) finalHeaders.set("Authorization", `Bearer ${accessToken}`);

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const isJson = res.headers.get("content-type")?.includes("application/json") ?? false;
  const data = isJson ? ((await res.json().catch(() => null)) as (T & ApiErrorBody) | null) : null;

  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.code ?? "unknown_error",
      data?.error?.message ?? `リクエストに失敗しました（HTTP ${res.status}）`,
    );
  }

  return data as T;
}

export function googleLoginUrl(): string {
  return `${API_BASE_URL}/v1/auth/oauth/google`;
}
