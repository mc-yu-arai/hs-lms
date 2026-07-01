import { env } from "../config/env";
import { HttpError } from "../middleware/errorHandler";

/**
 * supabase-js経由だと呼び出し元のセッション（refresh_token含む）の保持が必要になるため、
 * アクセストークンだけで完結するGoTrueのREST APIを直接叩く。
 */
async function patchAuthUser(accessToken: string, body: Record<string, unknown>, failureCode: string, failureMessage: string): Promise<void> {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const responseBody = (await res.json().catch(() => ({}))) as { msg?: string; error_description?: string; message?: string };
    const message = responseBody.msg ?? responseBody.error_description ?? responseBody.message ?? failureMessage;
    throw new HttpError(400, failureCode, message);
  }
}

// メールアドレス変更はSupabase Auth標準の二重確認（新アドレス宛の確認メール）に委ねる
// ことで「メールアドレス変更時の本人確認」要件を満たす。
export function requestEmailChange(accessToken: string, newEmail: string): Promise<void> {
  return patchAuthUser(accessToken, { email: newEmail }, "email_change_failed", "メールアドレスの変更に失敗しました");
}

// パスワードリセットのリンク（recoveryタイプのaction_link）から得たアクセストークンで
// パスワードを更新する。
export function updatePassword(accessToken: string, newPassword: string): Promise<void> {
  return patchAuthUser(
    accessToken,
    { password: newPassword },
    "password_update_failed",
    "パスワードの更新に失敗しました。リンクの有効期限が切れている可能性があります",
  );
}
