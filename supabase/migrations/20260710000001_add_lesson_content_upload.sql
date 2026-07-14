-- 0008: コンテンツアップロード・再生ブロック
-- lessons.content_type に 'learnwiz' を追加し、SCORM 1.2/2004判定結果を保持する scorm_version を追加する。
-- content_type の既存CHECK制約はCREATE TABLE時に無名で作成されているため、
-- Postgresのデフォルト命名規則(lessons_content_type_check)を前提にDROP IF EXISTSしてから明示的な名前で再作成する
-- （再実行しても安全なようIF EXISTS/IF NOT EXISTSを使う既存マイグレーションの方針を踏襲）。

ALTER TABLE public.lessons DROP CONSTRAINT IF EXISTS lessons_content_type_check;
ALTER TABLE public.lessons ADD CONSTRAINT lessons_content_type_check
  CHECK (content_type IN ('video', 'pdf', 'text', 'scorm', 'learnwiz'));

ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS scorm_version VARCHAR(10);
ALTER TABLE public.lessons DROP CONSTRAINT IF EXISTS lessons_scorm_version_check;
ALTER TABLE public.lessons ADD CONSTRAINT lessons_scorm_version_check
  CHECK (scorm_version IS NULL OR scorm_version IN ('1.2', '2004'));
