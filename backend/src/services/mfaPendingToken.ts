import { encryptPayload, decryptPayload } from "../lib/crypto";

const MFA_PENDING_TTL_MS = 5 * 60_000; // 5分

interface MfaPendingPayload {
  purpose: "mfa_pending";
  userId: string;
  supabaseAccessToken: string;
  supabaseRefreshToken: string;
  expiresAt: number;
}

/**
 * admin/super_adminの2FA検証待ちの間、パスワード検証済みで発行されたSupabaseセッションを
 * クライアントに渡さずサーバー側の暗号化トークンに一時保持する。DBには保存しない。
 */
export function createMfaPendingToken(userId: string, supabaseAccessToken: string, supabaseRefreshToken: string): string {
  const payload: MfaPendingPayload = {
    purpose: "mfa_pending",
    userId,
    supabaseAccessToken,
    supabaseRefreshToken,
    expiresAt: Date.now() + MFA_PENDING_TTL_MS,
  };
  return encryptPayload(payload);
}

export function verifyMfaPendingToken(token: string): { userId: string; supabaseAccessToken: string; supabaseRefreshToken: string } {
  let payload: MfaPendingPayload;
  try {
    payload = decryptPayload<MfaPendingPayload>(token);
  } catch {
    throw new Error("仮トークンが不正です");
  }

  if (payload.purpose !== "mfa_pending") {
    throw new Error("仮トークンが不正です");
  }
  if (Date.now() > payload.expiresAt) {
    throw new Error("仮トークンの有効期限が切れています。再度ログインしてください");
  }

  return {
    userId: payload.userId,
    supabaseAccessToken: payload.supabaseAccessToken,
    supabaseRefreshToken: payload.supabaseRefreshToken,
  };
}
