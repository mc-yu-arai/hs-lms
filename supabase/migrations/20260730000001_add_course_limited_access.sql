-- 0009: コースのグループ限定公開ブロック
-- courses.is_limited = true のコースは、group_courses でそのコースが割り当てられたグループに
-- 所属するユーザーのみ閲覧・受講登録できる（group_members × group_courses の突き合わせで判定）。
-- 既存コースは全て is_limited = false（従来通りの全体公開）のまま挙動が変わらないようデフォルトfalseとする。

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_limited BOOLEAN NOT NULL DEFAULT false;
