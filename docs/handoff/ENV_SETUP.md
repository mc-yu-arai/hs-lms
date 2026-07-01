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
- Google OAuth: クライアントID/シークレットは`.env`に設定済みだが、**Supabaseダッシュボード側でのGoogle Provider有効化・Redirect URL登録がまだ**（下記参照）
- Resend: 未接続

## Supabaseダッシュボードで手動設定が必要な項目
1. Authentication → Providers → Google を有効化し、`.env`と同じClient ID/Secretを登録
2. Authentication → URL Configuration → Redirect URLs に `http://localhost:3001/v1/auth/oauth/google/callback` を追加（本番デプロイ後は本番のAPI_BASE_URLも追加）
3. Storage → 新規バケット `avatars` を作成（Public bucketとして。`POST /users/me/avatar` の保存先）
