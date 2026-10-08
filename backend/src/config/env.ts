import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// リポジトリルートの .env を読み込む（backend/ 配下には置かない）
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET は32文字以上にしてください"),
  JWT_EXPIRES_IN: z.string().default("1h"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // メール送信はGAS Webアプリ経由（docs/gas-mailer/Code.gs）。
  // GAS_MAIL_URL: GASのWebアプリURL（…/exec）、GAS_MAIL_SECRET: GAS側と共有する秘密の文字列
  GAS_MAIL_URL: z.string().url().optional(),
  GAS_MAIL_SECRET: z.string().min(16, "GAS_MAIL_SECRET は16文字以上にしてください").optional(),
  API_BASE_URL: z.string().url().default("http://localhost:3001"),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
  SESSION_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(30),
  PASSWORD_RESET_EXPIRES_MINUTES: z.coerce.number().int().positive().default(60),
  PORT: z.coerce.number().int().positive().default(3001),
  // 設定時、ユーザー手動作成・CSVインポートの初期パスワードとしてランダム生成の代わりに使う（検証用の固定パスワード運用）
  DEFAULT_USER_PASSWORD: z.string().min(8).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("環境変数の検証に失敗しました:", parsed.error.flatten().fieldErrors);
  throw new Error("環境変数の設定を確認してください（.env / .env.example を参照）");
}

export const env = parsed.data;
