import { env } from "../config/env";
import { HttpError } from "../middleware/errorHandler";

/**
 * supabase-js経由だと呼び出し元のセッション（refresh_token含む）の保持が必要になるため、
 * アクセストークンだけで完結するGoTrueのREST APIを直接叩く。
 * メールアドレス変更はSupabase Auth標準の二重確認（新アドレス宛の確認メール）に委ねる
 * ことで「メールアドレス変更時の本人確認」要件を満たす。
 */
export async function requestEmailChange(accessToken: string, newEmail: string): Promise<void> {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ email: newEmail }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { msg?: string; error_description?: string; message?: string };
    const message = body.msg ?? body.error_description ?? body.message ?? "メールアドレスの変更に失敗しました";
    throw new HttpError(400, "email_change_failed", message);
  }
}
