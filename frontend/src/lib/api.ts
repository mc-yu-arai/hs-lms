const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
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
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  // FormData（アバターアップロード）はブラウザがboundary付きContent-Typeを自動設定するため上書きしない
  if (body !== undefined && !isFormData) finalHeaders.set("Content-Type", "application/json");
  if (accessToken) finalHeaders.set("Authorization", `Bearer ${accessToken}`);

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
    body: isFormData ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
  });

  const isJson = res.headers.get("content-type")?.includes("application/json") ?? false;
  const data = isJson ? ((await res.json().catch(() => null)) as (T & ApiErrorBody) | null) : null;

  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.code ?? "unknown_error",
      data?.error?.message ?? `リクエストに失敗しました（HTTP ${res.status}）`,
      data?.error,
    );
  }

  return data as T;
}

export async function apiFetchBlob(path: string, options: { accessToken?: string } = {}): Promise<Blob> {
  const headers = new Headers();
  if (options.accessToken) headers.set("Authorization", `Bearer ${options.accessToken}`);

  const res = await fetch(`${API_BASE_URL}${path}`, { headers });

  if (!res.ok) {
    let code = "unknown_error";
    let message = `リクエストに失敗しました（HTTP ${res.status}）`;
    if (res.headers.get("content-type")?.includes("application/json")) {
      const data = (await res.json().catch(() => null)) as ApiErrorBody | null;
      code = data?.error?.code ?? code;
      message = data?.error?.message ?? message;
    }
    throw new ApiError(res.status, code, message);
  }

  return res.blob();
}

export function googleLoginUrl(): string {
  return `${API_BASE_URL}/v1/auth/oauth/google`;
}
