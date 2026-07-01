import rateLimit from "express-rate-limit";

// 仕様書7.1: 1分あたり60リクエスト（認証済み）/ 10リクエスト（未認証）
export const apiRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: (req) => (req.headers.authorization ? 60 : 10),
  standardHeaders: true,
  legacyHeaders: false,
});

// ログイン試行はDBの失敗カウント（5回/15分ロック）とは別に、
// 分散ブルートフォース対策としてIP単位でも緩めに制限する。
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "too_many_requests", message: "試行回数が多すぎます。しばらく待ってから再試行してください" } },
});

// パスワードリセットのメール送信要求。大量送信・メールアドレス総当たりを防ぐため厳しめに絞る。
export const passwordResetRateLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "too_many_requests", message: "試行回数が多すぎます。しばらく待ってから再試行してください" } },
});
