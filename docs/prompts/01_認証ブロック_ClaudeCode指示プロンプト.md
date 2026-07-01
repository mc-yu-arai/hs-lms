# 派遣会社向けLMS — 認証・アカウント管理ブロック実装指示

## 背景・目的
派遣社員向け学習管理システム「HS-LMS」の認証・アカウント管理機能を実装する。
本ドキュメントの仕様に厳密に従って実装すること。曖昧な場合は仮実装で進めず、必ず質問すること。

## 技術スタック（開発環境・確定）
- フロントエンド: Next.js（TypeScript）→ Vercelにデプロイ
- バックエンドAPI: Node.js（Express）→ Renderにデプロイ
- データベース: PostgreSQL（Supabase）
- 認証基盤: Supabase Auth をベースに、JWTカスタムクレームでrole管理
- メール送信: Resend（パスワードリセット、通知系）
- ストレージ: Supabase Storage（アイコン画像等）

※本構成は開発・検証用。本番デプロイ先（AWS移行 or 継続利用）は別途判断するため、
  Supabase固有機能への過度な依存は避け、標準SQL・標準HTTP APIで実装すること。

## スコープ（今回の実装範囲）

### 含む機能
1. メール・パスワード認証（ログイン／ログアウト）
2. パスワードリセット（Resend経由でメール送信、リンク有効期限1時間）
3. 2要素認証（2FA）— TOTP方式、**管理者アカウントのみ必須**
4. OAuth 2.0 SSO（Googleログインのみ。Supabase Auth標準のGoogle Providerを利用）
5. アカウント管理（プロフィール更新、アイコンアップロード、メールアドレス変更時の本人確認）
6. パスワードポリシー（8文字以上、英数字記号混在必須）
7. ログイン試行制限（5回失敗で15分ロック）
8. セッションタイムアウト（非操作30分）

### 含まない機能（明示的に除外）
- SAML 2.0連携（将来対応。今回はOAuth 2.0のみ）
- 管理者以外への2FA適用

## データベース設計（厳守）

`users` テーブルは以下の通り（仕様書6.2.1準拠）。Supabase Auth の `auth.users` とは別に、
アプリケーション用の `public.users` テーブルを作成し、`auth.users.id` を外部キーとして紐付けること。

```sql
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email VARCHAR(255) UNIQUE NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  first_name VARCHAR(50) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('learner', 'admin', 'super_admin')),
  department VARCHAR(100),
  hire_date DATE,
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMP,
  totp_secret VARCHAR(255), -- 2FA用（暗号化して保存）
  totp_enabled BOOLEAN DEFAULT false,
  failed_login_count INTEGER DEFAULT 0,
  locked_until TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
```

## API設計（厳守）

仕様書7.2.1に準拠。ベースパスは `/v1` とする。

| メソッド | エンドポイント | 説明 | 認証要否 |
|---|---|---|---|
| POST | /auth/login | メール・パスワードログイン（JWT発行） | 不要 |
| POST | /auth/login/2fa | 2FAコード検証（adminの2段階目） | 仮トークン要 |
| POST | /auth/logout | ログアウト（トークン無効化） | 要 |
| POST | /auth/refresh | アクセストークンのリフレッシュ | リフレッシュトークン要 |
| GET  | /auth/oauth/google | Google OAuth開始 | 不要 |
| GET  | /auth/oauth/google/callback | Google OAuthコールバック | 不要 |
| POST | /auth/password/reset | パスワードリセットメール送信 | 不要 |
| PUT  | /auth/password/update | パスワード更新（リセットトークン検証後） | リセットトークン要 |
| POST | /auth/2fa/setup | 2FA設定開始（QRコード発行） | 要・admin限定 |
| POST | /auth/2fa/verify | 2FA初回有効化検証 | 要・admin限定 |
| GET  | /users/me | 自分のプロフィール取得 | 要 |
| PUT  | /users/me | プロフィール更新 | 要 |
| POST | /users/me/avatar | アイコン画像アップロード（JPEG/PNG、最大2MB） | 要 |

### トークン仕様
- アクセストークン（JWT）有効期限: 1時間
- リフレッシュトークン有効期限: 30日
- JWTには `sub`（user_id）、`role`、`exp` を含める

## 非機能要件（厳守）

- パスワードはbcryptまたはArgon2でハッシュ化（Supabase Auth標準機能を利用）
- ログイン試行5回失敗で15分間ロック（`failed_login_count` と `locked_until` で管理）
- セッションタイムアウト：非操作状態30分でフロントエンド側を自動ログアウト
- 通信はTLS必須（Render/Vercelのデフォルト設定で対応）
- SQLインジェクション・XSS・CSRF対策を実装すること（パラメータ化クエリ、入力サニタイズ、CSRFトークン）

## 実装の進め方（指示）

1. まず `public.users` テーブルのマイグレーションSQLを作成し、提示してから次に進むこと
2. バックエンドAPI（Express）を上記エンドポイント順に実装すること
3. 各APIには簡単な統合テスト（Jest等）を併せて作成すること
4. 環境変数が必要な箇所（Supabase URL/Key、Resend API Key、Google OAuth Client ID/Secret等）は
   `.env.example` にまとめ、実際の値は私が手動で設定する
5. 2FA・OAuth・SAML等、外部サービスとの契約・APIキー取得が必要な箇所に到達したら、
   実装を止めて先に教えてほしい（取得手順も含めて）
6. 不明点・仕様書との矛盾点があれば、仮実装せず必ず質問すること

## 動作確認について
実装が完了した機能から私が手動で動作確認します。確認観点（ログイン成功/失敗、
ロックアウト、パスワードリセット、2FA設定、Googleログイン等）のチェックリストも
別途まとめて提示してください。

## 引き継ぎドキュメントの運用（必須・毎回実施）

このプロジェクトは複数回のセッション・別チャットに分けて開発を進める。
そのため、**作業の節目ごとに**、別のアプリ／別チャットに引き継いでもそのまま続行できる
ドキュメントを `/docs/handoff/` 配下に作成・更新すること。具体的には以下を厳守する。

### 1. 更新タイミング
- 各エンドポイント・機能の実装が一区切りついた時点
- DBスキーマを変更した時点
- 外部サービス連携（OAuth、Resend等）の設定が完了した時点
- セッション終了時（明示的に「ここで区切る」と指示された時点）

### 2. 更新・作成するファイル

`/docs/handoff/PROJECT_STATUS.md`（常に最新化、上書き更新）
- プロジェクト概要（1〜2行）
- 現在の技術スタック（確定構成。変更があれば都度修正）
- 完了済み機能一覧（チェックボックス形式）
- 未着手・進行中の機能一覧
- 既知の問題・保留中の判断事項
- 直近の作業内容（最新3〜5件、日付付き）

`/docs/handoff/DB_SCHEMA.md`（スキーマ変更の都度更新）
- 現在の全テーブル定義（CREATE TABLE文そのまま）
- テーブル間のリレーション概要
- マイグレーション履歴（実行したSQLファイル名と概要）

`/docs/handoff/API_SPEC.md`（エンドポイント追加・変更の都度更新）
- 実装済み全APIエンドポイント一覧（メソッド・パス・認証要否・概要）
- リクエスト/レスポンスのサンプル（主要なもののみで可）

`/docs/handoff/ENV_SETUP.md`（環境変数・外部サービス関連の変更の都度更新）
- 必要な環境変数一覧と取得方法（`.env.example` と同期させる）
- 外部サービス（Supabase/Render/Vercel/Resend/Google OAuth等）の設定状況
- 未取得・要確認のクレデンシャル一覧

`/docs/handoff/SESSION_LOG.md`（毎セッション末尾に追記。これだけは追記式）
- セッション日時
- そのセッションで実施した作業内容（簡潔に）
- 次回セッションへの申し送り事項（「ここから再開」がわかるように）

### 3. ドキュメントの書き方の原則
- 新しいセッション（別チャット・別アプリ）が `PROJECT_STATUS.md` と `SESSION_LOG.md` の
  直近項目だけを読めば、文脈なしで作業を再開できるレベルの具体性で書くこと
- 専門用語の羅列ではなく、「何が終わっていて」「次に何をすべきか」を明確に書くこと
- コード全文の転記はしない（ファイルパスと役割の説明にとどめる）

### 4. セッション開始時の振る舞い
新しいセッションでこのプロジェクトの作業を再開する際は、まず
`/docs/handoff/PROJECT_STATUS.md` と `SESSION_LOG.md` の最新項目を読み、
現状を要約してから作業を開始すること。読んだ内容と私の認識にズレがあれば確認すること。
