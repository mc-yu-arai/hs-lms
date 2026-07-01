import { Router } from "express";
import QRCode from "qrcode";
import { z } from "zod";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/requireAuth";
import { encryptSecret, decryptSecret } from "../lib/crypto";
import { generateTotpSecret, buildOtpAuthUrl, verifyTotpCode } from "../services/totpService";
import { saveTotpSecret, enableTotp, findUserById } from "../services/userRepository";

export const twoFactorRouter = Router();

// admin/super_admin限定。QRコード提示用に新しいTOTPシークレットを発行し、
// この時点でDBに保存する（totp_enabledはfalseのまま。/verify成功時にtrueへ）。
twoFactorRouter.post(
  "/2fa/setup",
  requireAuth(),
  requireRole("admin", "super_admin"),
  asyncHandler(async (req, res) => {
    const user = req.appUser!;

    const secret = generateTotpSecret();
    const otpauthUrl = buildOtpAuthUrl(secret, user.email);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    await saveTotpSecret(user.id, encryptSecret(secret));

    return res.status(200).json({ secret, otpauthUrl, qrCodeDataUrl });
  }),
);

const verifySchema = z.object({ code: z.string().min(6).max(6) });

// admin/super_admin限定。/setupで発行したシークレットに対する初回のTOTPコード検証。
// 成功したらtotp_enabledをtrueにし、以降のログインで2FAが必須になる。
twoFactorRouter.post(
  "/2fa/verify",
  requireAuth(),
  requireRole("admin", "super_admin"),
  asyncHandler(async (req, res) => {
    const { code } = verifySchema.parse(req.body);
    const user = await findUserById(req.appUser!.id);

    if (!user?.totp_secret) {
      throw new HttpError(400, "2fa_not_set_up", "先に2FAのセットアップ（QRコード発行）を行ってください");
    }

    const secret = decryptSecret(user.totp_secret);
    if (!verifyTotpCode(secret, code)) {
      throw new HttpError(401, "invalid_totp_code", "認証コードが正しくありません");
    }

    await enableTotp(user.id);

    return res.status(200).json({ message: "2要素認証を有効化しました" });
  }),
);
