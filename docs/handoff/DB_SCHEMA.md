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
  is_limited BOOLEAN NOT NULL DEFAULT false, -- true: 割り当てられたグループのメンバーのみ閲覧・受講登録可能（グループ限定公開ブロックで追加）
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

-- レッスン（仕様書にDDLなし。content_typeはvideo/pdf/text/scorm/learnwizに対応）
-- scorm_versionはコンテンツアップロードブロック(2026-07-14)で追加。SCORM 1.2/2004の判定結果を保持する
CREATE TABLE public.lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('video', 'pdf', 'text', 'scorm', 'learnwiz')),
  content_url VARCHAR(500),
  content_body TEXT,
  duration_seconds INTEGER,
  display_order INTEGER NOT NULL DEFAULT 0,
  scorm_version VARCHAR(10) CHECK (scorm_version IS NULL OR scorm_version IN ('1.2', '2004')),
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
当初は「1コース=1テスト」（コース修了テストのみ）だったが、2026-08-19に章ごとの小テスト機能を追加し、`quizzes`に`quiz_type`（`'course'`/`'chapter'`）と`chapter_id`（章テストのみ使用）を追加した。同日、続けて章テストごとに合格点を個別設定できる`pass_score`カラムも追加した（詳細は本ファイル末尾の「章ごとの小テスト機能ブロック」参照）。コース修了テスト（`quiz_type='course'`）は引き続き`courses.pass_score`で採点するため`quizzes.pass_score`は未使用のまま（デフォルト70）残る。無制限受験のため`quiz_attempts`は1受講(enrollment)につき複数行になり得る。

```sql
CREATE TABLE public.quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE, -- 章テストのみ設定(quiz_type='chapter')
  quiz_type VARCHAR(20) NOT NULL DEFAULT 'course' CHECK (quiz_type IN ('course', 'chapter')),
  pass_score INTEGER NOT NULL DEFAULT 70 CHECK (pass_score >= 0 AND pass_score <= 100), -- 章テストのみ使用。0=結果にかかわらず全員合格
  title VARCHAR(200) NOT NULL,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CHECK ((quiz_type = 'chapter' AND chapter_id IS NOT NULL) OR (quiz_type = 'course' AND chapter_id IS NULL))
  -- 実際の制約は部分UNIQUEインデックス2本(quizzes_course_final_quiz_unique/quizzes_chapter_quiz_unique)。
  -- 詳細はsupabase/migrations/20260819000001_add_chapter_quiz.sql・20260819000002_add_quiz_pass_score.sql参照
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

**コース完了判定の拡張**: `courseRepository.ts`の`recalculateEnrollmentProgress`に`quizRequirementMet: boolean`引数を追加し、「全レッスン完了 && quizRequirementMet」で判定するよう変更。`quizRequirementMet`は「そのコースにテストが存在しない」または「そのenrollmentに合格済みの受験履歴が1件でもある」場合に`true`。呼び出し元（レッスン進捗更新API、テスト回答送信API）の両方で算出して渡す。2026-08-19、章ごとの小テスト機能の追加に伴い「全章テスト合格 + コース修了テスト合格(has_final_quizがtrueの場合)」も条件に含むよう拡張した（詳細は後述の「章ごとの小テスト機能ブロック」参照）。

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

## 通知・リマインダーブロックのテーブル
`notification_settings`はシングルトン運用（1行のみ。無ければアプリ側でGET時にデフォルト値で自動作成）。`notification_logs`の`course_id`は3種類の通知（受講登録完了/コース修了/期限切れリマインダー）がいずれもコースに紐づくためNOT NULL。

```sql
CREATE TABLE public.notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_days_before INTEGER NOT NULL DEFAULT 7,
  auto_send_time TIME NOT NULL DEFAULT '09:00:00',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE public.notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id),
  course_id UUID NOT NULL REFERENCES public.courses(id),
  notification_type VARCHAR(30) NOT NULL CHECK (notification_type IN ('enrollment_completed', 'course_completed', 'due_date_reminder')),
  is_success BOOLEAN NOT NULL,
  error_message TEXT,
  sent_at TIMESTAMP NOT NULL DEFAULT now()
);
```

**期限切れリマインダーの重複送信防止**: 同じ(`user_id`, `course_id`)に対する`due_date_reminder`は、成功ログ（`is_success = true`）が1件でもあれば以後送信しない（自動実行・手動実行いずれも）。「期限のN日前に1回だけ知らせる」という設計。期限（`enrollments.due_date`）を変更した場合の再送はスコープ外。

## グループ管理ブロックのテーブル
`groups`はグループ本体、`group_members`/`group_courses`は多対多の中間テーブル。いずれも独自`id`＋`UNIQUE`制約の組み合わせで、追加・割り当てAPIの冪等性を担保する（`enrollments`/`certificates`と同じ設計方針）。`group_members.user_id`/`group_courses.course_id`は`ON DELETE CASCADE`だが、これはグループ側の紐付け行を消すだけで、対応する`enrollments`は削除しない。

```sql
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  added_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

CREATE TABLE public.group_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (group_id, course_id)
);
```

**受講登録の自動作成（設計判断）**:
- コースをグループに割り当てた時点（`POST /groups/:id/courses`）で、そのグループの現メンバー全員のうち、そのコースにまだ`enrollments`が無いユーザーにのみ受講登録を自動作成する（`backend/src/services/groupService.ts`の`assignGroupCourseAndSyncEnrollments`）。
- 逆に、グループに既にコースが割り当て済みの状態で新規メンバーを追加した場合（`POST /groups/:id/members`）も、その時点で割り当て済みの全コースに対して同様に受講登録を自動作成する（`addGroupMemberAndSyncEnrollments`）。
- どちらも`findEnrollment`で既存有無を確認してから作成する冪等設計（既存の`POST /courses/:id/enroll`と同じ判断基準）。作成時は`notifyEnrollmentCompleted`も呼び出し、通知ブロックの`enrollment_completed`ログに記録される。
- メンバー削除・コース割り当て解除・グループ削除のいずれも、既に作成された`enrollments`（進捗含む）はそのまま残す。グループはあくまで「受講登録を一括で作る/管理する」ための入り口であり、受講履歴の所有権はグループに紐付けない設計とした。

## コースのグループ限定公開ブロック

`courses.is_limited = true`のコースは、`group_courses`でそのコースが割り当てられたグループに所属する（`group_members`）ユーザーのみ閲覧・受講登録できる。新規テーブルは追加せず、既存の`group_members`×`group_courses`を突き合わせて判定する（`courseRepository.ts`の`getAssignedCourseIdsForUserGroups`）。

- **対象エンドポイント**: `GET /v1/courses`（一覧、`is_limited`コースのうち非対象者には非表示）、`GET /v1/courses/:id`（詳細、非対象者には404）、`POST /v1/courses/:id/enroll`（受講登録、非対象者は404で拒否）。いずれもadmin/super_adminは`is_limited`に関わらず常に閲覧・登録可能。
- **既存の受講登録には遡及しない**: `POST /enroll`は「既存enrollmentがあれば冪等に200を返す」処理が限定公開チェックより先に評価されるため、後からグループ割り当てが外れても既存の受講登録自体は取り消されない（グループ管理ブロックの「グループ変更は既存enrollmentsに影響しない」という既存方針と一貫）。
- **存在の秘匿**: 詳細・受講登録のいずれも、対象外の場合は`course_not_found`（コース自体が存在しない場合と同じレスポンス）を返し、限定公開コースが存在すること自体を非対象者に知らせない設計にした。

## コンテンツアップロード・再生ブロック（SCORM/LearnWiz）

zipアップロードで受け取ったSCORM/LearnWizパッケージをSupabase Storageの公開バケット`lesson-content`に展開して保存する。DBスキーマの変更は`lessons.content_type`への`'learnwiz'`追加と`scorm_version`カラム追加のみ（新規テーブルは無し）。

- **アップロード**: `POST /v1/uploads/lesson-content`（admin/super_admin限定、multipart、300MB上限）が`backend/src/services/lessonContentStorage.ts`でzipを展開し、`imsmanifest.xml`の有無でSCORM、`lwConfig.xml`の有無でLearnWizと判定（`adm-zip`使用、ネイティブ依存を避ける既存方針を踏襲）。SCORMの場合`imsmanifest.xml`の`<schemaversion>`から`1.2`/`2004`を簡易判定する。zip内の`index.html`（トップレベル優先）をエントリポイントとし、全ファイルを`lesson-content/{アップロードごとのUUID}/...`へアップロードする。複数SCO構成のマニフェスト解析はスコープ外（単純に`index.html`を探すのみ）。
- **レッスンとの結びつけ**: `POST/PUT /courses`のchapters配列は保存の度に全置換されレッスンIDが再生成される既存の設計上の制約があるため、アップロードはレッスンのライフサイクルと切り離した独立エンドポイントにした。返却された`contentUrl`（Storage相対パス、例: `lesson-content/{uuid}/index.html`）を既存の「手入力URL欄」と同じ要領でレッスンの`content_url`にそのまま保存する。
- **同一オリジン配信プロキシ**: Supabase Storageの無料/標準プランは、アップロード時に`contentType: text/html`を指定しても**HTMLファイルをXSS対策として強制的にtext/plainで配信する**という既知の仕様上の制約がある（`.js`/`.css`等の他アセットは概ね指定通り配信される）。またSCORMランタイム(scorm-again)はiframe内から`window.parent.API`を辿るため、Supabase Storageの公開URL（別オリジン）を直接iframeに読み込むと同一オリジンポリシーで失敗する。この2つを同時に解決するため、`frontend/src/app/api/lesson-content/[...path]/route.ts`が同一オリジンの配信プロキシとして、Supabase Storageから取得した内容を拡張子ベースで正しいContent-Type（`text/html`等、`EXTENSION_MIME_TYPES`マップ参照）に付け替えて返す。フロントエンドは`content_url`を直接使わず、常にこのプロキシ経由（`/api/lesson-content/{content_url}`）でiframeのsrcを組み立てる。Rangeヘッダーも転送するため動画等の同梱アセットにも対応。
- **SCORM再生**: `scorm-again`パッケージを`import("scorm-again")`で動的import（named export `Scorm12API`/`Scorm2004API`。**サブパスimport（`scorm-again/scorm12`等）は型定義とビルド出力の食い違いで実行時に壊れるため使用しないこと** — ルートパッケージからのnamed importのみ使う）。`lessons.scorm_version`に応じて`Scorm12API`/`Scorm2004API`を`window.API`/`window.API_1484_11`にアタッチしてからiframeを描画する。完了検知は`api.on(...)`イベントリスナーで行うが、**SCORM 1.2は`LMSSetValue.cmi.core.lesson_status`、2004は`SetValue.cmi.completion_status`/`SetValue.cmi.success_status`と、バージョンによってイベント名接頭辞が異なる**（1.2は`LMSSetValue`/`LMSCommit`、2004は`SetValue`/`Commit`という別々の内部関数名を使うため）。値が`completed`/`passed`になった時点で1回だけ既存の`PUT /courses/:id/lessons/:lessonId/progress`（`completed:true`）を呼ぶ。`suspend_data`によるレジュームはスコープ外。
- **LearnWiz再生**: 上記プロキシ経由のiframe表示＋既存のPDF/テキストと同じ手動完了ボタンのみ（ランタイムAPI連携なし）。

## 章ごとの小テスト機能ブロック

確定パラメータ: 小テストは章の全レッスン完了後に受講者が任意のタイミングで受ける／不合格の場合は次の章のレッスンにアクセスできない（章ロック）／コース修了テストはコースごとに有り・無しを選べる。

- **`quizzes`の拡張**: 上記の通り`quiz_type`（`'course'`=コース修了テスト／`'chapter'`=章テスト）と`chapter_id`（章テストのみ）を追加。既存の`UNIQUE(course_id)`（1コース1テスト）を外し、部分UNIQUEインデックス2本（`quizzes_course_final_quiz_unique`: コースごとにコース修了テスト最大1件、`quizzes_chapter_quiz_unique`: 章ごとに章テスト最大1件）に置き換えた。`backend/src/services/quizRepository.ts`の`getQuizByCourseId`/`getQuizByChapterId`がそれぞれを取得し、`createOrReplaceCourseQuiz`/`createOrReplaceChapterQuiz`が内部共通実装(`createOrReplaceQuizRow`)を呼んで作成・全置換する。
- **`courses.has_final_quiz`**: `BOOLEAN NOT NULL DEFAULT true`。既存コースは全てtrueになり、「コース修了テストが未作成なら要件を満たしたことにする」という既存の後方互換動作をそのまま維持する。`false`にしても既存のコース修了テスト自体は削除しない（完了判定から除外されるのみ）。
- **既知の制約（承認済み）**: `chapter_id`は`ON DELETE CASCADE`のため、コース編集画面（`CourseForm`）で章・レッスン構成を保存し直すと章IDが再生成され、**紐づく章テスト(設問・受験履歴含む)も連鎖削除される**。既存の「編集のたびに`lesson_progress`がリセットされる」制約と同じ性質のものとして、2026-08-19にユーザー承認済み。章編集を非破壊にする改修は別スコープ。
- **章ロックの判定**: 章N+1がロックされる ⟺ 章Nに小テストが設定されていて、かつ合格履歴が無い（または章N自体が既にロック中で連鎖している場合）。章に小テストが無ければ次章をロックしない。最初の章は常にアンロック。`routes/courses.ts`の`computeChapterLocks`が章を`display_order`順に走査してMapを構築する。`GET /v1/courses/:id`のレスポンスは各章に`isLocked`を含み、ロック中の章はlessonの`contentUrl`/`contentBody`も隠す（限定公開コースと同じ「対象外には中身を見せない」パターン）。admin/super_adminは章ロックの対象外。
- **章テストの受験前提条件**: 章テストの回答送信API（`POST .../chapters/:chapterId/quiz/attempts`）は、その章の全レッスンが完了していないと409 `chapter_lessons_incomplete`で拒否する（`isChapterLessonsComplete`）。既存のコース修了テストにはこの前提条件チェックが元々無い（フロントの導線のみで制御）ため、今回新設した章テスト固有のサーバー側ガード。なお章がロック中の場合、そもそもその章のレッスン進捗を記録できない（`PUT .../progress`が403 `chapter_locked`を返す）ため、この409チェックが章ロックに対する防御としても機能する。
- **コース完了条件**: `computeQuizRequirementsMet`（`routes/courses.ts`）が「全ての章テスト（あれば）の合格」＋「`has_final_quiz=true`の場合のみコース修了テスト（あれば）の合格」を判定し、`recalculateEnrollmentProgress`の`quizRequirementMet`引数として渡す。レッスン進捗更新API・コース修了テスト回答送信API・章テスト回答送信APIの3箇所全てから同じ関数を呼ぶ。
- **テスト**: `backend/tests/chapterQuiz.test.ts`に10件追加（バックエンド合計201件全てパス）。管理者以外禁止・章の所属コース検証・章テストとコース修了テストの独立性・受験前提条件（レッスン未完了時の409）・章ロックの発生と解除・adminの章ロック対象外・コース完了条件（全章テスト+修了テスト／has_final_quiz=false時の修了テスト除外）を検証。
- **フロントエンド（初版・章テストの土台）**: 管理者向けは`CourseForm.tsx`に「コース修了テストを設定する」トグルと、既存の章（保存済みで実IDを持つもののみ）に「章テストを追加・編集」リンクを追加し、`/admin/courses/[id]/chapters/[chapterId]/quiz`（既存の`/admin/courses/[id]/quiz`を章テスト用に複製・改変）へ遷移する。新規追加した未保存の章にはリンクを出さず、先にコースを保存するよう促す文言を表示する。受講者向けは`/courses/[id]`のカリキュラム表示にロック中バッジ・ロック中レッスンの非リンク化・章テストボタン（その章の全レッスン完了時のみ表示、`hasQuiz`検出と同じ「各章にGETして404かどうかで判定」方式）を追加し、`/courses/[id]/chapters/[chapterId]/quiz`・`.../quiz/result`（既存のコース修了テスト受験・結果画面を複製・改変）を新設した。

### 章テストの合格点個別設定・管理UI改善（2026-08-19続き）

- **`quizzes.pass_score`**: `INTEGER NOT NULL DEFAULT 70 CHECK (pass_score >= 0 AND pass_score <= 100)`。章テスト(`quiz_type='chapter'`)のみ、この値で合否判定する（コース修了テストは`courses.pass_score`のまま）。`0`点の場合、`submitQuizAttempt`の判定式(`score >= passScore`)が得点にかかわらず常に`true`になるため、「結果にかかわらず全員合格」を専用の分岐なしで実現している。`backend/src/services/quizRepository.ts`の`createOrReplaceChapterQuiz`/`ensureChapterQuiz`が明示的に`pass_score`をセットする（コース修了テスト側の`createOrReplaceCourseQuiz`/`ensureQuizForCourse`は`pass_score`キーを渡さず、DBのデフォルト値のまま放置＝更新でも一切触らない設計）。
- **API**: `GET/POST /v1/courses/:id/chapters/:chapterId/quiz`のレスポンスの`quiz.passScore`は`quiz.pass_score`（章テスト自身の値）を返すよう変更（従来は誤って`course.pass_score`を返していた）。コース修了テスト側の`GET/POST /v1/courses/:id/quiz`は変更なし（引き続き`course.pass_score`を返す）。
- **章テストのCSVインポート**: 当初スコープ外としていたが、今回追加。`POST/GET /v1/courses/:id/chapters/:chapterId/quiz/import`・`.../import/template`を新設（`quizImportService.ts`の`importChapterQuizQuestionsFromCsv`/`ensureChapterQuiz`）。CSVの列構成・バリデーションはコース修了テスト側と共通（`importRowsIntoQuiz`に共通化）。テンプレートの内容もコース/章で同一のため、専用の生成ロジックは持たせず`buildQuizCsvTemplate()`をそのまま流用する。
- **章テストの削除**: `DELETE /v1/courses/:id/chapters/:chapterId/quiz`を新設（`quizRepository.ts`の`deleteChapterQuiz`。`quizzes`行を消せば`questions`/`choices`/`quiz_attempts`/`quiz_answers`はON DELETE CASCADEで連鎖削除される）。削除するとその章は次章をロックしなくなる（`computeChapterLocks`が「章に小テストが無ければ次章をロックしない」という既存ルールでそのまま処理するため、削除専用の追加ロジックは不要）。コース修了テスト側の削除は今回もスコープ外のまま（要望なし）。
- **フロントエンド**: `QuizImportModal.tsx`を`admin/courses/[id]/quiz/`から`admin/courses/`直下へ移動し、`courseId`ではなく`importUrl`/`templateUrl`を受け取る汎用コンポーネントに変更（コース修了テスト編集画面・章テスト編集画面の両方から共用）。章テスト編集画面（`chapters/[chapterId]/quiz/page.tsx`）に合格点入力欄（0点の場合の説明文付き）とCSVインポートボタンを追加。`CourseForm.tsx`の章カードは、保存済みの章についてマウント時に各章のテスト有無・問題数・合格点を取得し、テスト無しなら「+ 章テストを追加」ボタン、テストありなら「問題数: N問 / 合格点: X点（0点は「全員合格」表記）」のサマリーカード＋「編集」「削除」（`window.confirm`確認後にDELETE）を表示するよう変更。受講者向け`/courses/[id]`のカリキュラム表示にも、章テストがある章に「章テストあり（合格点: X点）」／0点時は「章テストあり（全員合格）」の青バッジを追加。
- **テスト**: `chapterQuiz.test.ts`に8件追加（個別合格点での採点・pass_score=0の自動合格・デフォルト70・DELETE系3件・CSVインポート系2件、バックエンド合計209件全てパス）。

## マイグレーション履歴
| ファイル | 概要 | 適用状況 |
|---|---|---|
| `supabase/migrations/20260701000001_create_users_table.sql` | `public.users` 作成、updated_at トリガー、RLS有効化 | 適用済み（2026-07-01ユーザー確認） |
| `supabase/migrations/20260701000002_create_courses_tables.sql` | `categories`/`courses`/`chapters`/`lessons`/`enrollments`/`lesson_progress` 作成 | 適用済み（2026-07-01。初回実行時は`public.set_updated_at()`未定義でエラーとなり、ファイル内で`CREATE OR REPLACE FUNCTION`として再定義＋`CREATE TABLE IF NOT EXISTS`化して再実行し成功） |
| `supabase/migrations/20260702000001_create_quiz_tables.sql` | `quizzes`/`questions`/`choices`/`quiz_attempts`/`quiz_answers` 作成 | 適用済み（2026-07-03ユーザー確認） |
| `supabase/migrations/20260706000001_create_certificates_table.sql` | `certificates` 作成 | 適用済み（2026-07-07ユーザー確認） |
| `supabase/migrations/20260707000001_create_notification_tables.sql` | `notification_settings`/`notification_logs` 作成 | 適用済み（2026-07-07ユーザー確認） |
| `supabase/migrations/20260707000002_create_group_tables.sql` | `groups`/`group_members`/`group_courses` 作成 | 適用済み（2026-07-07ユーザー確認） |
| `supabase/migrations/20260710000001_add_lesson_content_upload.sql` | `lessons.content_type`に`'learnwiz'`追加、`scorm_version`カラム追加 | 適用済み（2026-07-14ユーザー確認） |
| `supabase/migrations/20260730000001_add_course_limited_access.sql` | `courses.is_limited`カラム追加（グループ限定公開） | 適用済み（2026-07-30ユーザー確認） |
| `supabase/migrations/20260819000001_add_chapter_quiz.sql` | `quizzes.quiz_type`/`chapter_id`追加、`UNIQUE(course_id)`を部分UNIQUEインデックス2本に置換、`courses.has_final_quiz`カラム追加（章ごとの小テスト機能） | 適用済み（2026-08-19ユーザー確認） |
| `supabase/migrations/20260819000002_add_quiz_pass_score.sql` | `quizzes.pass_score`カラム追加（章テストごとの個別合格点） | 適用済み（2026-08-19ユーザー確認） |

## テーブル間のリレーション概要
- `public.users.id` → `auth.users.id`（Supabase Auth管理のユーザーとアプリ用プロフィールを1:1で紐付け）
- `courses.category_id` → `categories.id`
- `courses.prerequisite_course_id` → `courses.id`（自己参照。前提コース）
- `chapters.course_id` → `courses.id`、`lessons.chapter_id` → `chapters.id`
- `enrollments.user_id` → `users.id`、`enrollments.course_id` → `courses.id`（UNIQUE制約で1ユーザー1コースにつき1レコード）
- `lesson_progress.enrollment_id` → `enrollments.id`、`lesson_progress.lesson_id` → `lessons.id`（UNIQUE制約で1受講あたり1レッスンにつき1レコード）
- `group_members.group_id` → `groups.id`、`group_members.user_id` → `users.id`（UNIQUE制約で1グループ1ユーザーにつき1レコード）
- `group_courses.group_id` → `groups.id`、`group_courses.course_id` → `courses.id`（UNIQUE制約で1グループ1コースにつき1レコード）。`enrollments`への直接の外部キーは持たない（グループ経由で作成された受講登録も通常の`enrollments`行として扱われ、グループとの追跡用リンクは無い）
