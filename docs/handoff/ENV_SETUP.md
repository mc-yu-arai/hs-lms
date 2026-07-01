# ENV_SETUP

`.env` はリポジトリルート（`C:\hs-lms\.env`）に配置。`backend/`はdotenvでこのファイルを読み込む（`backend/src/config/env.ts`）。

## 設定状況

| 変数 | 状況 | 取得元 |
|---|---|---|
| SUPABASE_URL | ✅ 設定済み | Supabaseダッシュボード → Settings → API |
| SUPABASE_PUBLISHABLE_KEY | ✅ 設定済み | 同上 |
| SUPABASE_SECRET_KEY | ✅ 設定済み（バックエンド専用・厳秘） | 同上 |
| JWT_SECRET | ✅ 設定済み | ランダム生成済み |
| GOOGLE_CLIENT_ID / SECRET | ✅ 設定済み | Google Cloud Console |
| RESEND_API_KEY | ❌ プレースホルダのまま(`re_xxxxxxxxxx`) | Resendダッシュボード → API Keys |
| RESEND_FROM_EMAIL | ⚠️ テスト用ドメイン(`onboarding@resend.dev`)のまま | 本番移行時に自社ドメインへ変更 |

## 未取得・要確認のクレデンシャル
- **Resend APIキー**: パスワードリセットメール実装（`POST /auth/password/reset`）に必須。取得後、`.env`の`RESEND_API_KEY`を実キーに差し替えてください。

## 外部サービス設定状況
- Supabase: プロジェクト作成済み・接続情報取得済み。`public.users`マイグレーションは未適用（`supabase/migrations/20260701000001_create_users_table.sql`をSupabase SQL Editorまたは`supabase db push`で実行してください）
- Google OAuth: クライアントID/シークレット取得済み。Supabase Auth側のGoogle Provider設定（Authorized redirect URI等）はまだダッシュボードで未確認 — OAuth実装着手時に確認します
- Resend: 未接続
