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
| RESEND_API_KEY | ✅ 設定済み（2026-07-01実キーに更新） | Resendダッシュボード → API Keys |
| RESEND_FROM_EMAIL | ⚠️ テスト用ドメイン(`onboarding@resend.dev`)のまま | 本番移行時に自社ドメインへ変更 |

## 未取得・要確認のクレデンシャル
- なし（主要なクレデンシャルはすべて設定済み）

## 外部サービス設定状況
- Supabase: プロジェクト作成済み・接続情報取得済み。マイグレーション2本とも適用済み（`supabase/migrations/`）
- Google OAuth: クライアントID/シークレットは`.env`に設定済みだが、**Supabaseダッシュボード側でのGoogle Provider有効化・Redirect URL登録がまだ**（下記参照）
- Resend: 実キー設定済み。パスワードリセットメールはSupabaseのメール設定を経由せず、バックエンドから直接Resend APIを呼んで送信している（`backend/src/lib/resend.ts`）

## Supabaseダッシュボードで手動設定が必要な項目
1. Authentication → Providers → Google を有効化し、`.env`と同じClient ID/Secretを登録
2. Authentication → URL Configuration → Redirect URLs に `http://localhost:3001/v1/auth/oauth/google/callback` を追加（本番デプロイ後は本番のAPI_BASE_URLも追加）
3. Storage → 新規バケット `avatars` を作成（Public bucketとして。`POST /users/me/avatar` の保存先）
4. Authentication → Email OTP / Link expiry のリカバリーリンク有効期限が1時間になっているか確認（`.env`の`PASSWORD_RESET_EXPIRES_MINUTES=60`と揃える。ここは独立した設定なので自動連動しない）

## フロントエンド（frontend/）の環境変数

`frontend/.env.local`（gitignore対象、`frontend/.env.example`を元に各自作成）:

| 変数 | 値（開発環境） | 備考 |
|---|---|---|
| NEXT_PUBLIC_API_BASE_URL | `http://localhost:3001` | backendの`API_BASE_URL`と一致させる |
| NEXT_PUBLIC_SESSION_TIMEOUT_MINUTES | `30` | backendの`SESSION_TIMEOUT_MINUTES`と一致させる |

`NEXT_PUBLIC_`プレフィックスの変数はブラウザに露出するため、秘密情報は入れないこと（実際どちらも秘密情報ではない）。
