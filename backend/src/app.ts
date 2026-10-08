import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { authRouter } from "./routes/auth";
import { oauthRouter } from "./routes/oauth";
import { twoFactorRouter } from "./routes/twoFactor";
import { usersRouter } from "./routes/users";
import { passwordResetRouter } from "./routes/passwordReset";
import { coursesRouter } from "./routes/courses";
import { certificatesRouter } from "./routes/certificates";
import { reportsRouter } from "./routes/reports";
import { notificationsRouter } from "./routes/notifications";
import { groupsRouter } from "./routes/groups";
import { categoriesRouter } from "./routes/categories";
import { uploadsRouter } from "./routes/uploads";
import { apiRateLimiter } from "./middleware/rateLimit";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();

  // Render等のホスティング環境では、リバースプロキシ(ロードバランサー)が1段挟まる。
  // 未設定だと req.ip が常にプロキシのIPになり、レート制限(IP単位)が全利用者の合計で
  // 数えられてしまう。X-Forwarded-For の末尾1段(=プロキシが記録した接続元)のみ信用する。
  // 数値を大きくすると利用者がヘッダーを偽装してレート制限を回避できるため、段数は実構成と一致させること。
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(apiRateLimiter);

  app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

  app.use("/v1/auth", authRouter);
  app.use("/v1/auth", oauthRouter);
  app.use("/v1/auth", twoFactorRouter);
  app.use("/v1/auth", passwordResetRouter);
  app.use("/v1/users", usersRouter);
  app.use("/v1/courses", coursesRouter);
  app.use("/v1/certificates", certificatesRouter);
  app.use("/v1/reports", reportsRouter);
  app.use("/v1/admin", notificationsRouter);
  app.use("/v1/groups", groupsRouter);
  app.use("/v1/categories", categoriesRouter);
  app.use("/v1/uploads", uploadsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
