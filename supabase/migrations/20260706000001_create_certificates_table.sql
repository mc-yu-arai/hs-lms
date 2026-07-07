-- 0005: 修了証発行ブロック(Certificate)
-- idを内部主キー、verification_uuidをQRコード/公開検証URL専用のトークンとして分離。
-- UNIQUE(user_id, course_id)で1ユーザー1コースにつき1枚のみとし、発行APIの冪等性を担保する。

CREATE TABLE IF NOT EXISTS public.certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id),
  course_id UUID NOT NULL REFERENCES public.courses(id),
  issued_at TIMESTAMP NOT NULL DEFAULT now(),
  verification_uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  UNIQUE (user_id, course_id)
);

ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
