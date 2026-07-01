# DB_SCHEMA

## public.users
`auth.users`（Supabase Auth）と1:1。パスワード自体はauth.users側で管理し、本テーブルは持たない。

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
-- + updated_at自動更新トリガー、RLS有効化（バックエンドはservice_role keyでアクセスするため実質バイパス）
```

`totp_secret` はアプリ側（`backend/src/lib/crypto.ts` の `encryptSecret`/`decryptSecret`、AES-256-GCM・鍵は`JWT_SECRET`から導出）で暗号化してから保存する。平文保存はしない。

## リフレッシュトークン／パスワードリセットトークン
専用テーブルは**作成していない**。開発環境ではSupabase Auth自体のセッション管理（`auth.sessions`等、Supabase内部管理でアプリからは不可視）をそのまま利用する方針のため。
本番移行時にPostgresへ切り出す場合は、以下のようなテーブルが候補（未作成・未確定）:
- `refresh_tokens`（user_id, token_hash, expires_at, revoked_at）
- `password_reset_tokens`（user_id, token_hash, expires_at, used_at）

## マイグレーション履歴
| ファイル | 概要 | 適用状況 |
|---|---|---|
| `supabase/migrations/20260701000001_create_users_table.sql` | `public.users` 作成、updated_at トリガー、RLS有効化 | **未適用**（Supabase SQL Editor または `supabase db push` で実行が必要） |

## テーブル間のリレーション概要
- `public.users.id` → `auth.users.id`（Supabase Auth管理のユーザーとアプリ用プロフィールを1:1で紐付け）
