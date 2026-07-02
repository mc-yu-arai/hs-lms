"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { AuthUser } from "@/lib/types";

interface TwoFactorResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

function TwoFactorForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setSession } = useAuth();
  const pendingToken = searchParams.get("pendingToken") ?? "";

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(pendingToken ? null : "ログインセッションが見つかりません。もう一度ログインしてください");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!pendingToken) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const res = await apiFetch<TwoFactorResponse>("/v1/auth/login/2fa", {
        method: "POST",
        body: { pendingToken, code },
      });
      setSession({ accessToken: res.accessToken, refreshToken: res.refreshToken, user: res.user });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "認証に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-center text-xl font-bold text-gray-900">2要素認証</h1>
        <p className="mb-6 text-center text-sm text-gray-500">
          認証アプリ（Google Authenticator等）に表示されている6桁のコードを入力してください
        </p>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            autoFocus
            disabled={!pendingToken}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-center text-lg tracking-[0.5em] text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
          />

          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !pendingToken || code.length !== 6}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? "確認中..." : "確認"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm">
          <a href="/login" className="text-blue-600 hover:underline">
            ログイン画面に戻る
          </a>
        </p>
      </div>
    </main>
  );
}

export default function TwoFactorPage() {
  return (
    <Suspense fallback={null}>
      <TwoFactorForm />
    </Suspense>
  );
}
