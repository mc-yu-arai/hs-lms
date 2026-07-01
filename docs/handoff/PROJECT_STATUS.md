# PROJECT_STATUS

## プロジェクト概要
派遣会社向け学習管理システム「HS-LMS」。**認証・アカウント管理ブロックとコース管理ブロックのAPI実装が完了**（バックエンドのみ。フロントエンドは未着手）。

## 技術スタック（確定）
- フロントエンド: Next.js（TypeScript）→ Vercel（未着手）
- バックエンドAPI: Node.js + Express（TypeScript）→ Render（`backend/`）
- データベース: PostgreSQL（Supabase）
- 認証基盤: Supabase Auth（`auth.users`）＋ アプリ用 `public.users`。ロール等のカスタムクレームはSupabase Auth Hookではなく、バックエンド側で `public.users.role` を都度参照する方式（Supabase固有機能への依存を避けるため）
- メール送信: Resend（実キー設定済み。パスワードリセットメールで利用中）
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
- [x] `GET /v1/auth/oauth/google`, `GET /v1/auth/oauth/google/callback`（Supabase Auth標準Google Provider、PKCEフロー。**未登録メールでの自己サインアップは拒否**する設計）
- [x] `POST /v1/auth/2fa/setup`, `POST /v1/auth/2fa/verify`（TOTPシークレット発行・QRコード・admin/super_admin限定）
- [x] `GET /v1/users/me`, `PUT /v1/users/me`, `POST /v1/users/me/avatar`（プロフィール取得・更新、メール変更は確認メール方式、アバターはSupabase Storage）
- [x] `POST /v1/auth/password/reset`, `PUT /v1/auth/password/update`（Supabase Admin `generateLink(recovery)` でリンク発行、Resendで送信。更新はGoTrue REST APIを利用。パスワードポリシー（8文字以上・英数字記号混在）を`PUT /auth/password/update`側でも検証）
- [x] ルート `.gitignore` 作成（`.env` が未追跡だったが `.gitignore` 自体が存在せず、コミットされる恐れがあったため追加）。個人メモ`memo/`も機密情報(DBパスワード)を含むため除外
- [x] Jest統合テスト36件（全てパス）

**指示書（`docs/prompts/01_認証ブロック_ClaudeCode指示プロンプト.md`）記載の全13エンドポイントの実装が完了。**

- [x] コース管理ブロック: `categories`/`courses`/`chapters`/`lessons`/`enrollments`/`lesson_progress`のマイグレーション作成（未適用）
- [x] コース管理ブロック: 仕様書7.2.3記載の8エンドポイント（`GET/POST/PUT/DELETE /courses`系、`enroll`、`progress`系）を実装
- [x] コース管理ブロック: Jestテスト14件追加（フェイクDBによる統合テスト、全てパス）

## 未着手・進行中
- [ ] コース管理・認証ブロック共通のマイグレーションSQL2本をSupabaseに実際に適用（`20260701000002_create_courses_tables.sql`が未適用。ユーザー側の作業待ち。適用後、実サーバーでの通しの動作確認が必要）
- [ ] フロントエンド（Next.js）は未着手
- [ ] CSRF対策（現状JWT Bearerのみでcookieを使っていないため優先度は下げているが、フロント実装時にcookie方式を採る場合は要対応）
- [ ] Supabaseのパスワードリカバリーリンクの有効期限設定（ダッシュボード側）が実際に1時間になっているかの確認
- [ ] テスト機能（Quiz/Question/Answer）・修了証・レポートAPI・グループ管理・通知は別ブロックとして未着手（`docs/handoff/API_SPEC.md`参照）
- [ ] コース完了判定は現在「全レッスン完了」のみ。仕様書3.2.4の「修了テスト合格」条件は、テスト機能ブロック実装後に`courseRepository.ts`の`recalculateEnrollmentProgress`を拡張する必要あり

## 外部サービス側で追加設定が必要な項目（要ユーザー作業）
- [ ] Supabaseダッシュボード → Authentication → Providers でGoogle Providerを有効化し、Client ID/Secretを登録
- [ ] Supabaseダッシュボード → Authentication → URL Configuration の Redirect URLs に `http://localhost:3001/v1/auth/oauth/google/callback`（本番URLも later）を追加
- [ ] Supabase Storageに `avatars` という名前の公開バケットを作成（`POST /users/me/avatar` が書き込み先として使用）

## 既知の問題・保留中の判断事項
- `public.users` テーブルが実際のSupabaseプロジェクトにまだ存在しない（マイグレーション未適用のため、全APIが500になる状態）
- 2FA仮トークンは暗号化されたオペーク文字列としてサーバー内で完結させており、DBには保存していない（5分で失効）。ユーザーが2FA未完了のまま放置した場合、内部で保持していたSupabaseセッション自体は生成済みのまま残る（誰にも渡らないため実害は低いが、本番移行時に要再検討）
- Google OAuthは「CSVによる一括インポート（管理者）」で事前に`public.users`に登録済みのメールアドレスのみログインを許可する設計にした（自己サインアップは不可）。運用方針と異なる場合は要相談
- メールアドレス変更（`PUT /users/me`）はSupabase Auth標準の確認メール方式（新アドレス宛にリンク送信）に委ねており、リンククリックで確定した時点で次回認証済みリクエスト時に`public.users.email`を同期する方式（`requireAuth`ミドルウェア内）。確認メールの送信経路自体はSupabaseのデフォルト（Resend経由ではない）のままなので、Resendに統一したい場合はSupabase側のCustom SMTP設定が別途必要
- パスワードリセットのメール送信は自前でResend APIを呼んでいる（`backend/src/lib/resend.ts`）ため、Supabase Auth側のメール送信設定（Custom SMTP）は使っていない。Supabase側のリカバリーリンク有効期限設定（ダッシュボードのAuth設定、デフォルト1時間）と`.env`の`PASSWORD_RESET_EXPIRES_MINUTES`(=60)は独立した設定なので、変更する場合は両方合わせること
- コース管理: `courses`/`enrollments`以外のテーブル（`categories`/`chapters`/`lessons`/`lesson_progress`）は仕様書にDDLが存在せず、ER概要・機能要件から独自設計した（詳細は`docs/handoff/DB_SCHEMA.md`）。設計確認をユーザーに依頼したが応答が得られなかったため、推奨案のまま実装している
- コース作成・更新（`POST/PUT /courses`）で章・レッスンをまとめて登録する際、supabase-jsはクライアント側で複数テーブルにまたがるDBトランザクションを提供しないため、レッスン登録に失敗した場合は作成しかけたコースを削除する形でロールバックを模倣している（本物のトランザクションではない）。将来的にはPostgres関数(RPC)化を検討
- 受講登録（`POST /courses/:id/enroll`）は既に受講済みの場合エラーにせず200で既存のenrollmentを返す冪等設計にした（仕様書に明記なし、UX優先の判断）
- コース完了判定は現状「全レッスン完了」のみで、修了テスト合格は考慮していない（テスト機能が別ブロックのため）

## 直近の作業内容
- 2026-07-01: `docs/prompts/`の指示書を読み込み、`public.users`マイグレーションを提示。リフレッシュ/リセットトークンの保存方式についてユーザーに確認し、「開発環境はSupabase、本番はPostgres移行予定」の方針を確定。バックエンド雛形とログイン〜リフレッシュ〜ログアウトの一連のセッションAPIを実装し、テストも整備。
- 2026-07-01: Google OAuth（PKCE）、2FAセットアップ、ユーザーAPI（プロフィール・アバター）を実装。実装済み全機能をコミット（ローカルのみ、push未実施）。テストは29件全てパス。
- 2026-07-01: Resend実キー設定完了の連絡を受け、パスワードリセット（`POST /auth/password/reset`, `PUT /auth/password/update`）を実装。Supabase Admin APIの`generateLink(recovery)`でリンクを発行し、Resendで自前送信する方式（Supabase側のメール設定に依存しない）。これで指示書記載の全エンドポイントの実装が完了。テストは36件全てパス。
- 2026-07-01: マイグレーション適用完了の報告を受け、Supabaseダッシュボードの手動設定手順（Google Provider/Redirect URL/avatarsバケット）を案内。続けてコース管理ブロックに着手。仕様書のDB設計に`courses`/`enrollments`しかDDLが無いため、`categories`/`chapters`/`lessons`/`lesson_progress`を独自設計してマイグレーションを提示（ユーザー確認は得られず、推奨案のまま採用）。7.2.3記載の8エンドポイントを実装し、テストを14件追加（合計50件、全てパス）。テスト機能・修了証・レポート・グループ管理は別ブロックとして明示的にスコープ外にした。
