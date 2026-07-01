-- 0001: public.users テーブル作成
-- 認証・アカウント管理ブロック指示書（docs/prompts/01_認証ブロック_ClaudeCode指示プロンプト.md）
-- 「データベース設計」section の CREATE TABLE 定義に厳密準拠。
-- パスワード自体は Supabase Auth の auth.users 側でハッシュ化・管理される（本テーブルには持たない）。

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

-- updated_at 自動更新（挙動追加のみ・スキーマ定義自体は変更なし）
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: バックエンドは service_role key（RLSをバイパス）でアクセスする前提。
-- publishable key から誤って直接アクセスされないよう、デフォルト拒否にしておく。
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
