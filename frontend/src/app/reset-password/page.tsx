"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";

const PASSWORD_RULES = "8文字以上で、英字・数字・記号をそれぞれ1つ以上含めてください";

// バックエンドの POST /auth/password/reset はSupabaseのrecovery action_linkを発行し、
// リンククリック後にブラウザを {FRONTEND_URL}/reset-password#access_token=...&type=recovery
// にリダイレクトする。URLフラグメントはサーバーに送らないため、ここで読み取って使う。
export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    const params = new URLSearchParams(hash);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(params.get("access_token"));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError("リンクが無効です。もう一度パスワードリセットをリクエストしてください");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("パスワードが一致しません");
      return;
    }

    setIsSubmitting(true);
    try {
      await apiFetch("/v1/auth/password/update", {
        method: "PUT",
        body: { token, newPassword },
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "パスワードの更新に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-center text-xl font-bold text-gray-900">新しいパスワードの設定</h1>

        {done ? (
          <div className="space-y-4">
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              パスワードを更新しました。新しいパスワードでログインしてください。
            </p>
            <a href="/login" className="block text-center text-sm text-blue-600 hover:underline">
              ログイン画面へ
            </a>
          </div>
        ) : token === undefined ? (
          <p className="text-center text-sm text-gray-500">確認中...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {!token && (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                リンクが無効か、有効期限が切れています。もう一度パスワードリセットをリクエストしてください。
              </p>
            )}

            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
                新しいパスワード
              </label>
              <input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                required
                disabled={!token}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
              />
              <p className="mt-1 text-xs text-gray-400">{PASSWORD_RULES}</p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                新しいパスワード（確認）
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                disabled={!token}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !token}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? "更新中..." : "パスワードを更新"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
