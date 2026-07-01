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
import { apiRateLimiter } from "./middleware/rateLimit";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();

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

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
