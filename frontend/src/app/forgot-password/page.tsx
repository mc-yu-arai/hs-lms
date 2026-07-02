"use client";

import { useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await apiFetch<{ message: string }>("/v1/auth/password/reset", {
        method: "POST",
        body: { email },
      });
      setMessage(res.message);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "リクエストに失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-center text-xl font-bold text-gray-900">パスワードをお忘れの方</h1>
        <p className="mb-6 text-center text-sm text-gray-500">
          登録済みのメールアドレスを入力してください。パスワード再設定用のリンクをお送りします。
        </p>

        {submitted ? (
          <div className="space-y-4">
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>
            <a href="/login" className="block text-center text-sm text-blue-600 hover:underline">
              ログイン画面に戻る
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                メールアドレス
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? "送信中..." : "送信"}
            </button>

            <p className="text-center text-sm">
              <a href="/login" className="text-blue-600 hover:underline">
                ログイン画面に戻る
              </a>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
