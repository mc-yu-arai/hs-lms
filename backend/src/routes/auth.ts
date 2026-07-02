import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { supabaseAuth, supabaseAdmin } from "../lib/supabase";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { loginRateLimiter } from "../middleware/rateLimit";
import {
  findUserByEmail,
  findUserById,
  recordFailedLogin,
  resetFailedLoginCount,
  touchLastLogin,
  toPublicProfile,
} from "../services/userRepository";
import { createMfaPendingToken, verifyMfaPendingToken } from "../services/mfaPendingToken";
import { decryptSecret } from "../lib/crypto";
import { verifyTotpCode } from "../services/totpService";

export const authRouter = Router();

const GENERIC_LOGIN_ERROR = "メールアドレスまたはパスワードが正しくありません";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post(
  "/login",
  loginRateLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    const appUser = await findUserByEmail(email);
    if (!appUser) {
      throw new HttpError(401, "invalid_credentials", GENERIC_LOGIN_ERROR);
    }

    if (!appUser.is_active) {
      throw new HttpError(403, "account_disabled", "アカウントが無効化されています。管理者にお問い合わせください");
    }

    if (appUser.locked_until && new Date(appUser.locked_until) > new Date()) {
      const minutesLeft = Math.ceil((new Date(appUser.locked_until).getTime() - Date.now()) / 60_000);
      throw new HttpError(423, "account_locked", `ログイン試行回数の上限に達しました。約${minutesLeft}分後に再試行してください`);
    }

    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      await recordFailedLogin(appUser.id, env.LOGIN_MAX_ATTEMPTS, env.LOGIN_LOCK_MINUTES);
      throw new HttpError(401, "invalid_credentials", GENERIC_LOGIN_ERROR);
    }

    await resetFailedLoginCount(appUser.id);

    const requires2fa = (appUser.role === "admin" || appUser.role === "super_admin") && appUser.totp_enabled;

    if (requires2fa) {
      const pendingToken = createMfaPendingToken(appUser.id, data.session.access_token, data.session.refresh_token);
      return res.status(200).json({ requiresTwoFactor: true, pendingToken });
    }

    await touchLastLogin(appUser.id);
    return res.status(200).json({
      requiresTwoFactor: false,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in,
      user: toPublicProfile(appUser),
    });
  }),
);

const login2faSchema = z.object({
  pendingToken: z.string().min(1),
  code: z.string().min(6).max(6),
});

authRouter.post(
  "/login/2fa",
  loginRateLimiter,
  asyncHandler(async (req, res) => {
    const { pendingToken, code } = login2faSchema.parse(req.body);

    let pending;
    try {
      pending = verifyMfaPendingToken(pendingToken);
    } catch (e) {
      throw new HttpError(401, "invalid_pending_token", (e as Error).message);
    }

    const appUser = await findUserById(pending.userId);
    if (!appUser || !appUser.totp_enabled || !appUser.totp_secret) {
      throw new HttpError(400, "2fa_not_enabled", "2要素認証が設定されていません");
    }

    const secret = decryptSecret(appUser.totp_secret);
    if (!verifyTotpCode(secret, code)) {
      throw new HttpError(401, "invalid_totp_code", "認証コードが正しくありません");
    }

    await touchLastLogin(appUser.id);

    return res.status(200).json({
      accessToken: pending.supabaseAccessToken,
      refreshToken: pending.supabaseRefreshToken,
      user: toPublicProfile(appUser),
    });
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new HttpError(401, "unauthorized", "認証が必要です");
    }
    const accessToken = header.slice("Bearer ".length);

    const { error } = await supabaseAdmin.auth.admin.signOut(accessToken, "global");
    if (error) {
      throw new HttpError(400, "logout_failed", "ログアウトに失敗しました");
    }

    return res.status(200).json({ message: "ログアウトしました" });
  }),
);

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);

    const { data, error } = await supabaseAuth.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) {
      throw new HttpError(401, "invalid_refresh_token", "リフレッシュトークンが無効です。再度ログインしてください");
    }

    const appUser = await findUserById(data.session.user.id);
    if (!appUser || !appUser.is_active) {
      throw new HttpError(403, "account_disabled", "アカウントが無効化されています");
    }

    return res.status(200).json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in,
    });
  }),
);
