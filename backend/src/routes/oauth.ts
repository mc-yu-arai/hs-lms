import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env";
import { supabaseAdmin } from "../lib/supabase";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { createCapturingStorage } from "../lib/capturingStorage";
import { encryptPayload, decryptPayload } from "../lib/crypto";
import { findUserById, touchLastLogin } from "../services/userRepository";
import { createMfaPendingToken } from "../services/mfaPendingToken";

export const oauthRouter = Router();

const PKCE_COOKIE = "hslms_oauth_pkce";
const PKCE_COOKIE_TTL_MS = 5 * 60_000;

function newOAuthClient(storage: ReturnType<typeof createCapturingStorage>) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { flowType: "pkce", detectSessionInUrl: false, persistSession: false, storage },
  });
}

// Google認証を開始する。Supabase Auth標準のGoogle Providerに委譲し、
// PKCEのcode_verifierはCookie(暗号化・httpOnly・5分)でこのリクエストとcallbackの間だけ引き継ぐ。
oauthRouter.get(
  "/oauth/google",
  asyncHandler(async (req, res) => {
    const storage = createCapturingStorage();
    const client = newOAuthClient(storage);

    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${env.API_BASE_URL}/v1/auth/oauth/google/callback`,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data.url) {
      throw new HttpError(500, "oauth_start_failed", "Google認証の開始に失敗しました");
    }

    const cookieValue = encryptPayload({ verifier: storage.dump(), expiresAt: Date.now() + PKCE_COOKIE_TTL_MS });
    res.cookie(PKCE_COOKIE, cookieValue, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: PKCE_COOKIE_TTL_MS,
    });

    return res.redirect(data.url);
  }),
);

// Googleからのコールバック。code_verifierをCookieから復元してセッションを確定させ、
// public.usersに未登録のアカウントでの自己サインアップは許可しない
// （仕様書のユーザー登録はCSV一括インポート＝管理者運用が前提のため）。
oauthRouter.get(
  "/oauth/google/callback",
  asyncHandler(async (req, res) => {
    const errorDescription = req.query.error_description as string | undefined;
    if (errorDescription) {
      return res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent(errorDescription)}`);
    }

    const code = req.query.code as string | undefined;
    if (!code) {
      throw new HttpError(400, "missing_code", "認証コードがありません");
    }

    const cookieValue = req.cookies?.[PKCE_COOKIE] as string | undefined;
    res.clearCookie(PKCE_COOKIE);
    if (!cookieValue) {
      return res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent("認証セッションの有効期限が切れました。もう一度お試しください")}`);
    }

    let seed: Record<string, string>;
    try {
      const payload = decryptPayload<{ verifier: Record<string, string>; expiresAt: number }>(cookieValue);
      if (Date.now() > payload.expiresAt) throw new Error("expired");
      seed = payload.verifier;
    } catch {
      return res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent("認証セッションの有効期限が切れました。もう一度お試しください")}`);
    }

    const client = newOAuthClient(createCapturingStorage(seed));
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error || !data.session) {
      return res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent("Google認証の検証に失敗しました")}`);
    }

    const appUser = await findUserById(data.session.user.id);
    if (!appUser || !appUser.is_active) {
      await supabaseAdmin.auth.admin.signOut(data.session.access_token, "global");
      const message = appUser ? "アカウントが無効化されています" : "アカウントが見つかりません。管理者にお問い合わせください";
      return res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent(message)}`);
    }

    const requiresTwoFactor = (appUser.role === "admin" || appUser.role === "super_admin") && appUser.totp_enabled;
    if (requiresTwoFactor) {
      const pendingToken = createMfaPendingToken(appUser.id, data.session.access_token, data.session.refresh_token);
      return res.redirect(`${env.FRONTEND_URL}/auth/2fa?pendingToken=${encodeURIComponent(pendingToken)}`);
    }

    await touchLastLogin(appUser.id);

    const redirectUrl = new URL(`${env.FRONTEND_URL}/auth/callback`);
    redirectUrl.hash = new URLSearchParams({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: String(data.session.expires_in),
    }).toString();

    return res.redirect(redirectUrl.toString());
  }),
);
