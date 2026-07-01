-- 0002: コース管理ブロック
-- 仕様書6.2.2(courses)/6.2.3(enrollments)のDDLに厳密準拠しつつ、
-- 機能要件(3.2.2/4.3.1)にのみ登場し6.2にDDLが無い項目・テーブルを補う。
--
-- 前回実行時に「public.set_updated_at()が存在しない」で失敗したため、
-- この関数をここでも再定義（CREATE OR REPLACEなので既存でも安全）した上で、
-- 途中まで作成されたテーブルがあっても再実行できるようIF NOT EXISTS / DROP TRIGGER IF EXISTSにしてある。

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- 6.2.2 courses（仕様書のカラムはそのまま。updated_at/thumbnail_url/prerequisite_course_idを追加）
CREATE TABLE IF NOT EXISTS public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  category_id UUID REFERENCES public.categories(id),
  level VARCHAR(20) NOT NULL CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  duration_minutes INTEGER,
  pass_score INTEGER DEFAULT 70,
  is_published BOOLEAN DEFAULT false,
  is_mandatory BOOLEAN DEFAULT false,
  thumbnail_url VARCHAR(500),
  prerequisite_course_id UUID REFERENCES public.courses(id),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- 章（ER概要6.1のChapterに対応。仕様書にDDLなし）
CREATE TABLE IF NOT EXISTS public.chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- レッスン（ER概要6.1のLessonに対応。仕様書にDDLなし）
CREATE TABLE IF NOT EXISTS public.lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('video', 'pdf', 'text', 'scorm')),
  content_url VARCHAR(500),
  content_body TEXT,
  duration_seconds INTEGER,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- 6.2.3 enrollments（仕様書のカラムはそのまま。updated_at/UNIQUE制約を追加）
CREATE TABLE IF NOT EXISTS public.enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id),
  course_id UUID NOT NULL REFERENCES public.courses(id),
  status VARCHAR(20) NOT NULL CHECK (status IN ('enrolled', 'in_progress', 'completed', 'expired')),
  progress_rate DECIMAL(5,2) DEFAULT 0,
  total_study_time INTEGER DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  due_date DATE,
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);

-- レッスン単位の進捗（ER概要6.1のProgressに対応。仕様書にDDLなし）
CREATE TABLE IF NOT EXISTS public.lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  progress_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  last_position_seconds INTEGER,
  completed_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, lesson_id)
);

DROP TRIGGER IF EXISTS trg_courses_set_updated_at ON public.courses;
CREATE TRIGGER trg_courses_set_updated_at BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_chapters_set_updated_at ON public.chapters;
CREATE TRIGGER trg_chapters_set_updated_at BEFORE UPDATE ON public.chapters FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_lessons_set_updated_at ON public.lessons;
CREATE TRIGGER trg_lessons_set_updated_at BEFORE UPDATE ON public.lessons FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_enrollments_set_updated_at ON public.enrollments;
CREATE TRIGGER trg_enrollments_set_updated_at BEFORE UPDATE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_lesson_progress_set_updated_at ON public.lesson_progress;
CREATE TRIGGER trg_lesson_progress_set_updated_at BEFORE UPDATE ON public.lesson_progress FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;
