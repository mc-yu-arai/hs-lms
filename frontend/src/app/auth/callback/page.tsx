"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

// バックエンドの GET /v1/auth/oauth/google/callback はブラウザを
// {FRONTEND_URL}/auth/callback#access_token=...&refresh_token=...&expires_in=...
// にリダイレクトする。URLフラグメントはサーバーに送信されないため、
// ここ（クライアント側）で読み取って保存する必要がある。
export default function AuthCallbackPage() {
  const router = useRouter();
  const { loginWithTokens } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken || !refreshToken) {
      // URLフラグメント（window.location.hash）はマウント後にしか読めないため
      // effect内での検証結果反映は意図的な一度きりの外部システム同期
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("認証情報を取得できませんでした。もう一度ログインしてください");
      return;
    }

    loginWithTokens(accessToken, refreshToken)
      .then(() => router.replace("/dashboard"))
      .catch(() => setError("ログイン処理に失敗しました。もう一度お試しください"));
  }, [loginWithTokens, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        {error ? (
          <>
            <p role="alert" className="mb-4 text-sm text-red-600">
              {error}
            </p>
            <a href="/login" className="text-sm text-blue-600 hover:underline">
              ログイン画面に戻る
            </a>
          </>
        ) : (
          <p className="text-sm text-gray-500">ログイン処理中...</p>
        )}
      </div>
    </main>
  );
}
