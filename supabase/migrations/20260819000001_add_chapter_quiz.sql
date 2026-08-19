-- 0009: 章ごとの小テスト機能
-- quizzesは元々「1コース=1テスト(コース修了テストのみ)」設計(course_id UNIQUE)だったが、
-- 章ごとの小テストにも対応するため、quiz_type('course'/'chapter')とchapter_id(chapter用のみ)を追加する。
-- 既存行(全てコース修了テスト)はquiz_typeのデフォルト値'course'にそのまま乗るため、データ移行は不要。
--
-- 注意(既存の制約と同じ性質の既知の制約): chapter_idはchaptersへのON DELETE CASCADEのため、
-- コース編集画面(CourseForm)で章・レッスン構成を保存し直すたびに章が全削除→再作成される既存の
-- 仕様(courseRepository.tsのreplaceCurriculum)により、その章に紐づく章テスト(設問・受験履歴含む)も
-- 連鎖削除される。既存のlesson_progressリセットと同じ性質の制約として許容する(2026-08-19ユーザー承認)。

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS quiz_type VARCHAR(20) NOT NULL DEFAULT 'course' CHECK (quiz_type IN ('course', 'chapter')),
  ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE;

-- 既存の「1コース1テスト」制約(UNIQUE(course_id))を外し、代わりに
-- 「コース修了テストはコースごとに最大1件」「章テストは章ごとに最大1件」の部分UNIQUEに置き換える
ALTER TABLE public.quizzes DROP CONSTRAINT IF EXISTS quizzes_course_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS quizzes_course_final_quiz_unique
  ON public.quizzes (course_id) WHERE quiz_type = 'course';

CREATE UNIQUE INDEX IF NOT EXISTS quizzes_chapter_quiz_unique
  ON public.quizzes (chapter_id) WHERE quiz_type = 'chapter';

-- quiz_typeとchapter_idの整合性を強制(章テストは必ずchapter_idあり、コース修了テストは必ず無し)
ALTER TABLE public.quizzes DROP CONSTRAINT IF EXISTS quizzes_chapter_id_matches_type;
ALTER TABLE public.quizzes
  ADD CONSTRAINT quizzes_chapter_id_matches_type CHECK (
    (quiz_type = 'chapter' AND chapter_id IS NOT NULL) OR
    (quiz_type = 'course' AND chapter_id IS NULL)
  );

-- コースごとに修了テストの「有り・無し」を選べるようにする。既存コースは全てtrue(従来通り、
-- コース修了テストが作成されていればその合格を要求し、未作成なら要件を満たしたことにする既存動作を維持)
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS has_final_quiz BOOLEAN NOT NULL DEFAULT true;
