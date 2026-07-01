import type { NextFunction, Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { HttpError } from "./errorHandler";
import type { AppUser } from "../services/userRepository";
import { findUserById } from "../services/userRepository";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      appUser?: AppUser;
    }
  }
}

export function requireAuth() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new HttpError(401, "unauthorized", "認証が必要です");
    }

    const accessToken = header.slice("Bearer ".length);
    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
    if (error || !data.user) {
      throw new HttpError(401, "unauthorized", "アクセストークンが無効です");
    }

    const appUser = await findUserById(data.user.id);
    if (!appUser || !appUser.is_active) {
      throw new HttpError(403, "forbidden", "アカウントが無効化されています");
    }

    req.appUser = appUser;
    next();
  };
}

export function requireRole(...roles: Array<AppUser["role"]>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.appUser || !roles.includes(req.appUser.role)) {
      throw new HttpError(403, "forbidden", "この操作を行う権限がありません");
    }
    next();
  };
}
