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

## コース管理ブロックのテーブル
仕様書6.2にはDDLが`courses`(6.2.2)と`enrollments`(6.2.3)にしかなく、ER概要(6.1)や機能要件(3.2.2/4.3.1)に登場する`Chapter`/`Lesson`/`Progress`/`categories`はテーブル定義自体が存在しなかったため、以下の方針で設計した（ユーザー確認は得られなかったため推奨案のまま採用。要望があれば変更可）。

```sql
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- 6.2.2準拠 + updated_at/thumbnail_url/prerequisite_course_idを追加(4.3.1の機能要件のみに存在)
CREATE TABLE public.courses (
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

-- 章（仕様書にDDLなし。ER概要のChapterに対応）
CREATE TABLE public.chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- レッスン（仕様書にDDLなし。content_typeはvideo/pdf/text/scormのみ対応。SCORM実行エンジン・インタラクティブスライドはスコープ外）
CREATE TABLE public.lessons (
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

-- 6.2.3準拠 + updated_at/UNIQUE(user_id, course_id)を追加(二重受講登録の防止)
CREATE TABLE public.enrollments (
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

-- レッスン単位の進捗（仕様書にDDLなし。ER概要のProgressに対応）
CREATE TABLE public.lesson_progress (
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
```

**「完了(completed)」の判定について**: 現時点では「コース内の全レッスンが完了」のみでenrollmentを`completed`にしている。仕様書3.2.4は本来「全レッスン完了 かつ 修了テスト合格」を要求しているが、テスト機能(Quiz/Question/Answer)は別ブロックのため未実装。テスト機能ブロック着手時に、この判定ロジック(`courseRepository.ts`の`recalculateEnrollmentProgress`)を「テスト合格」も条件に含めるよう拡張する必要がある。

## テスト機能ブロックのテーブル
「1コース=1テスト」（コース修了テストのみが今回のスコープ）。合格点は`courses.pass_score`を流用するため`quizzes`テーブルには持たせない。無制限受験のため`quiz_attempts`は1受講(enrollment)につき複数行になり得る。

```sql
CREATE TABLE public.quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL UNIQUE REFERENCES public.courses(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type VARCHAR(20) NOT NULL CHECK (question_type IN ('single_choice', 'multiple_choice')),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE public.choices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  choice_text VARCHAR(500) NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- 受験履歴。enrollmentに紐付ける(受講登録=ユーザー×コースに対する受験)
CREATE TABLE public.quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  score DECIMAL(5,2) NOT NULL,
  is_passed BOOLEAN NOT NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT now()
);

-- 選択した選択肢。1選択肢1行(複数選択問題は同じquestion_idで複数行)
CREATE TABLE public.quiz_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  choice_id UUID NOT NULL REFERENCES public.choices(id) ON DELETE CASCADE,
  UNIQUE (attempt_id, question_id, choice_id)
);
```

**採点方法**: 設問ごとに「正解の選択肢集合」と「選択した選択肢集合」を比較し、完全一致（過不足なし）なら正解。得点は`(正解設問数 / 全設問数) × 100`。合否は`score >= courses.pass_score`。

**コース完了判定の拡張**: `courseRepository.ts`の`recalculateEnrollmentProgress`に`quizRequirementMet: boolean`引数を追加し、「全レッスン完了 && quizRequirementMet」で判定するよう変更。`quizRequirementMet`は「そのコースにテストが存在しない」または「そのenrollmentに合格済みの受験履歴が1件でもある」場合に`true`。呼び出し元（レッスン進捗更新API、テスト回答送信API）の両方で算出して渡す。

## 修了証発行ブロックのテーブル
`id`（内部主キー）と`verification_uuid`（QRコード・公開検証URL専用トークン）を分離。`UNIQUE(user_id, course_id)`で1ユーザー1コースにつき1枚のみとし、発行APIの冪等性をこの制約で担保する。発行条件（コース修了済みのみ）はDB制約ではなくアプリ側（`enrollments.status === 'completed'`）でチェックする。

```sql
CREATE TABLE public.certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id),
  course_id UUID NOT NULL REFERENCES public.courses(id),
  issued_at TIMESTAMP NOT NULL DEFAULT now(),
  verification_uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  UNIQUE (user_id, course_id)
);
```

## マイグレーション履歴
| ファイル | 概要 | 適用状況 |
|---|---|---|
| `supabase/migrations/20260701000001_create_users_table.sql` | `public.users` 作成、updated_at トリガー、RLS有効化 | 適用済み（2026-07-01ユーザー確認） |
| `supabase/migrations/20260701000002_create_courses_tables.sql` | `categories`/`courses`/`chapters`/`lessons`/`enrollments`/`lesson_progress` 作成 | 適用済み（2026-07-01。初回実行時は`public.set_updated_at()`未定義でエラーとなり、ファイル内で`CREATE OR REPLACE FUNCTION`として再定義＋`CREATE TABLE IF NOT EXISTS`化して再実行し成功） |
| `supabase/migrations/20260702000001_create_quiz_tables.sql` | `quizzes`/`questions`/`choices`/`quiz_attempts`/`quiz_answers` 作成 | 適用済み（2026-07-03ユーザー確認） |
| `supabase/migrations/20260706000001_create_certificates_table.sql` | `certificates` 作成 | 未適用（要Supabase側で実行） |

## テーブル間のリレーション概要
- `public.users.id` → `auth.users.id`（Supabase Auth管理のユーザーとアプリ用プロフィールを1:1で紐付け）
- `courses.category_id` → `categories.id`
- `courses.prerequisite_course_id` → `courses.id`（自己参照。前提コース）
- `chapters.course_id` → `courses.id`、`lessons.chapter_id` → `chapters.id`
- `enrollments.user_id` → `users.id`、`enrollments.course_id` → `courses.id`（UNIQUE制約で1ユーザー1コースにつき1レコード）
- `lesson_progress.enrollment_id` → `enrollments.id`、`lesson_progress.lesson_id` → `lessons.id`（UNIQUE制約で1受講あたり1レッスンにつき1レコード）
