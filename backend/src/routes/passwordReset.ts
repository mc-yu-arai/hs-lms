import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { asyncHandler } from "../middleware/errorHandler";
import { passwordResetRateLimiter } from "../middleware/rateLimit";
import { supabaseAdmin } from "../lib/supabase";
import { findUserByEmail } from "../services/userRepository";
import { sendEmail } from "../lib/resend";
import { updatePassword } from "../lib/gotrueRest";

export const passwordResetRouter = Router();

const requestSchema = z.object({ email: z.string().email() });

// メールアドレスの存在有無を漏らさないため、ユーザーが見つかっても見つからなくても
// 常に同じ成功レスポンスを返す。
passwordResetRouter.post(
  "/password/reset",
  passwordResetRateLimiter,
  asyncHandler(async (req, res) => {
    const { email } = requestSchema.parse(req.body);

    const appUser = await findUserByEmail(email);
    if (appUser?.is_active) {
      const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${env.FRONTEND_URL}/reset-password` },
      });

      if (!error && data.properties?.action_link) {
        try {
          await sendEmail(
            email,
            "【HS-LMS】パスワード再設定のご案内",
            `<p>パスワード再設定のリクエストを受け付けました。</p>
<p>以下のリンクから新しいパスワードを設定してください（有効期限: ${env.PASSWORD_RESET_EXPIRES_MINUTES}分）。</p>
<p><a href="${data.properties.action_link}">パスワードを再設定する</a></p>
<p>このリクエストに心当たりがない場合は、本メールを破棄してください。</p>`,
          );
        } catch (sendError) {
          // メール送信基盤の障害（Resendのサンドボックス制限など）をクライアントに
          // そのまま露出すると挙動の違いからメールアドレスの存在有無が漏れるため、
          // ここで握りつぶしてサーバー側にのみ記録し、レスポンスは常に同じ成功にする。
          console.error("パスワードリセットメールの送信に失敗しました:", sendError);
        }
      }
    }

    return res.status(200).json({
      message: "ご入力のメールアドレス宛にパスワード再設定のご案内を送信しました（該当するアカウントが存在する場合）",
    });
  }),
);

const updateSchema = z.object({
  token: z.string().min(1),
  newPassword: z
    .string()
    .min(8, "パスワードは8文字以上にしてください")
    .regex(/[A-Za-z]/, "英字を含めてください")
    .regex(/[0-9]/, "数字を含めてください")
    .regex(/[^A-Za-z0-9]/, "記号を含めてください"),
});

// tokenはパスワードリセットメール内リンク（recovery）をクリックして得られるアクセストークン
passwordResetRouter.put(
  "/password/update",
  asyncHandler(async (req, res) => {
    const { token, newPassword } = updateSchema.parse(req.body);
    await updatePassword(token, newPassword);
    return res.status(200).json({ message: "パスワードを更新しました" });
  }),
);
