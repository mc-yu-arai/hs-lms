# PROJECT_STATUS

## プロジェクト概要
派遣会社向け学習管理システム「HS-LMS」。現在は認証・アカウント管理ブロックを実装中。

## 技術スタック（確定）
- フロントエンド: Next.js（TypeScript）→ Vercel（未着手）
- バックエンドAPI: Node.js + Express（TypeScript）→ Render（`backend/`）
- データベース: PostgreSQL（Supabase）
- 認証基盤: Supabase Auth（`auth.users`）＋ アプリ用 `public.users`。ロール等のカスタムクレームはSupabase Auth Hookではなく、バックエンド側で `public.users.role` を都度参照する方式（Supabase固有機能への依存を避けるため）
- メール送信: Resend（未接続。APIキーはプレースホルダのまま）
- ストレージ: Supabase Storage（アイコン画像、未実装）

## セッション／トークン管理方針（重要な設計判断）
仕様書はRedisでのセッション管理を想定していたが、現構成にRedisはない。ユーザーの意向により：
- **開発・検証環境ではSupabase Authのセッション機構をそのまま利用**（`signInWithPassword` / `signOut` / `refreshSession`）。独自の `refresh_tokens` テーブルは作らない。
- **本番移行時にPostgres管理の独自トークンテーブルへ移行予定。** 移行時は `backend/src/routes/auth.ts` の `/refresh` `/logout` 実装を差し替える想定（Supabase呼び出し箇所はこの1ファイルに集約してあるので影響範囲は限定的）。

## 完了済み機能
- [x] `public.users` テーブルのマイグレーション作成（未適用、要Supabase側で実行）
- [x] バックエンドプロジェクト雛形（Express + TypeScript、`backend/`）
- [x] `POST /v1/auth/login`（ロックアウト判定、Supabase Auth検証、失敗カウント、admin/super_adminの2FAゲート）
- [x] `POST /v1/auth/login/2fa`（仮トークン検証＋TOTP検証、暗号化保持していたSupabaseセッションを返却）
- [x] `POST /v1/auth/logout`（Supabase Admin APIでトークン無効化）
- [x] `POST /v1/auth/refresh`（Supabaseのリフレッシュセッションをラップ）
- [x] ルート `.gitignore` 作成（`.env` が未追跡だったが `.gitignore` 自体が存在せず、コミットされる恐れがあったため追加）
- [x] Jest統合テスト10件（login/2fa/health、すべてパス）

## 未着手・進行中
- [ ] マイグレーションSQLをSupabaseに実際に適用（ユーザー側の作業待ち）
- [ ] `POST /auth/oauth/google`, `GET /auth/oauth/google/callback`（Google OAuth Client ID/Secretは`.env`設定済み、未実装）
- [ ] `POST /auth/password/reset`, `PUT /auth/password/update`（**Resend APIキーがプレースホルダ`re_xxxxxxxxxx`のまま。実キー取得後に着手**）
- [ ] `POST /auth/2fa/setup`, `POST /auth/2fa/verify`（TOTPシークレット発行・QRコード・admin限定）
- [ ] `GET/PUT /users/me`, `POST /users/me/avatar`（プロフィール、Supabase Storageアップロード）
- [ ] フロントエンド（Next.js）は未着手
- [ ] CSRF対策（現状JWT Bearerのみでcookieを使っていないため優先度は下げているが、フロント実装時にcookie方式を採る場合は要対応）

## 既知の問題・保留中の判断事項
- `public.users` テーブルが実際のSupabaseプロジェクトにまだ存在しない（マイグレーション未適用のため、ログインAPIを叩くと500になる）
- Resend APIキーが未設定のため、パスワードリセットのメール送信は未実装
- 2FA仮トークンは暗号化されたオペーク文字列としてサーバー内で完結させており、DBには保存していない（5分で失効）。ユーザーが2FA未完了のまま放置した場合、内部で保持していたSupabaseセッション自体は生成済みのまま残る（誰にも渡らないため実害は低いが、本番移行時に要再検討）

## 直近の作業内容
- 2026-07-01: `docs/prompts/`の指示書を読み込み、`public.users`マイグレーションを提示。リフレッシュ/リセットトークンの保存方式についてユーザーに確認し、「開発環境はSupabase、本番はPostgres移行予定」の方針を確定。バックエンド雛形とログイン〜リフレッシュ〜ログアウトの一連のセッションAPIを実装し、テストも整備。
