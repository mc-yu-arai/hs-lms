import { supabaseAdmin } from "../lib/supabase";

export type CourseLevel = "beginner" | "intermediate" | "advanced";
export type ContentType = "video" | "pdf" | "text" | "scorm";
export type EnrollmentStatus = "enrolled" | "in_progress" | "completed" | "expired";

export interface Course {
  id: string;
  title: string;
  description: string | null;
  category_id: string | null;
  level: CourseLevel;
  duration_minutes: number | null;
  pass_score: number;
  is_published: boolean;
  is_mandatory: boolean;
  thumbnail_url: string | null;
  prerequisite_course_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Lesson {
  id: string;
  chapter_id: string;
  title: string;
  content_type: ContentType;
  content_url: string | null;
  content_body: string | null;
  duration_seconds: number | null;
  display_order: number;
}

export interface Chapter {
  id: string;
  course_id: string;
  title: string;
  display_order: number;
}

export interface ChapterWithLessons extends Chapter {
  lessons: Lesson[];
}

export interface Enrollment {
  id: string;
  user_id: string;
  course_id: string;
  status: EnrollmentStatus;
  progress_rate: number;
  total_study_time: number;
  started_at: string | null;
  completed_at: string | null;
  due_date: string | null;
}

export interface LessonProgress {
  id: string;
  enrollment_id: string;
  lesson_id: string;
  is_completed: boolean;
  progress_percent: number;
  last_position_seconds: number | null;
  completed_at: string | null;
}

export interface CourseListFilters {
  keyword?: string;
  categoryId?: string;
  level?: CourseLevel;
  publishedOnly: boolean;
}

export async function listCourses(filters: CourseListFilters): Promise<Course[]> {
  let query = supabaseAdmin.from("courses").select("*").order("created_at", { ascending: false });

  if (filters.publishedOnly) query = query.eq("is_published", true);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.level) query = query.eq("level", filters.level);
  if (filters.keyword) query = query.ilike("title", `%${filters.keyword}%`);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Course[];
}

export async function getCourseById(id: string): Promise<Course | null> {
  const { data, error } = await supabaseAdmin.from("courses").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Course | null;
}

export async function getChaptersWithLessons(courseId: string): Promise<ChapterWithLessons[]> {
  const { data: chapters, error: chapterError } = await supabaseAdmin
    .from("chapters")
    .select("*")
    .eq("course_id", courseId)
    .order("display_order", { ascending: true });
  if (chapterError) throw chapterError;

  const { data: lessons, error: lessonError } = await supabaseAdmin
    .from("lessons")
    .select("*")
    .in("chapter_id", (chapters ?? []).map((c) => c.id))
    .order("display_order", { ascending: true });
  if (lessonError) throw lessonError;

  return (chapters ?? []).map((chapter) => ({
    ...(chapter as Chapter),
    lessons: (lessons ?? []).filter((l) => l.chapter_id === chapter.id) as Lesson[],
  }));
}

export async function getChapterById(id: string): Promise<Chapter | null> {
  const { data, error } = await supabaseAdmin.from("chapters").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Chapter | null;
}

export async function countLessonsForCourse(courseId: string): Promise<number> {
  const chapters = await getChaptersWithLessons(courseId);
  return chapters.reduce((sum, c) => sum + c.lessons.length, 0);
}

export interface LessonInput {
  title: string;
  contentType: ContentType;
  contentUrl?: string | null;
  contentBody?: string | null;
  durationSeconds?: number | null;
}

export interface ChapterInput {
  title: string;
  lessons: LessonInput[];
}

export interface CourseInput {
  title: string;
  description?: string | null;
  categoryId?: string | null;
  level: CourseLevel;
  durationMinutes?: number | null;
  passScore?: number;
  isPublished?: boolean;
  isMandatory?: boolean;
  thumbnailUrl?: string | null;
  prerequisiteCourseId?: string | null;
  chapters?: ChapterInput[];
}

function toCourseRow(input: CourseInput) {
  return {
    title: input.title,
    description: input.description ?? null,
    category_id: input.categoryId ?? null,
    level: input.level,
    duration_minutes: input.durationMinutes ?? null,
    pass_score: input.passScore ?? 70,
    is_published: input.isPublished ?? false,
    is_mandatory: input.isMandatory ?? false,
    thumbnail_url: input.thumbnailUrl ?? null,
    prerequisite_course_id: input.prerequisiteCourseId ?? null,
  };
}

// 章・レッスンをネストで受け取り置き換える。supabase-jsはクライアントサイドで
// 複数テーブルにまたがるトランザクションを提供しないため、レッスン登録に失敗した場合は
// 作成しかけたコースを削除してロールバックを模倣する（作成時のみ）。
async function replaceCurriculum(courseId: string, chapters: ChapterInput[]) {
  const { error: deleteError } = await supabaseAdmin.from("chapters").delete().eq("course_id", courseId);
  if (deleteError) throw deleteError;

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    const { data: chapterRow, error: chapterError } = await supabaseAdmin
      .from("chapters")
      .insert({ course_id: courseId, title: chapter.title, display_order: i })
      .select("*")
      .single();
    if (chapterError) throw chapterError;

    if (chapter.lessons.length > 0) {
      const lessonRows = chapter.lessons.map((lesson, j) => ({
        chapter_id: chapterRow.id,
        title: lesson.title,
        content_type: lesson.contentType,
        content_url: lesson.contentUrl ?? null,
        content_body: lesson.contentBody ?? null,
        duration_seconds: lesson.durationSeconds ?? null,
        display_order: j,
      }));
      const { error: lessonError } = await supabaseAdmin.from("lessons").insert(lessonRows);
      if (lessonError) throw lessonError;
    }
  }
}

export async function createCourse(input: CourseInput): Promise<Course> {
  const { data: course, error } = await supabaseAdmin.from("courses").insert(toCourseRow(input)).select("*").single();
  if (error) throw error;

  try {
    await replaceCurriculum(course.id, input.chapters ?? []);
  } catch (err) {
    await supabaseAdmin.from("courses").delete().eq("id", course.id);
    throw err;
  }

  return course as Course;
}

export async function updateCourse(id: string, input: Partial<CourseInput>): Promise<Course | null> {
  const patch = toCourseRow({ title: "", level: "beginner", ...input });
  // タイトル・レベルなど未指定のフィールドは既存値を壊さないようundefinedのキーは送らない
  const sparsePatch: Record<string, unknown> = {};
  if (input.title !== undefined) sparsePatch.title = patch.title;
  if (input.description !== undefined) sparsePatch.description = patch.description;
  if (input.categoryId !== undefined) sparsePatch.category_id = patch.category_id;
  if (input.level !== undefined) sparsePatch.level = patch.level;
  if (input.durationMinutes !== undefined) sparsePatch.duration_minutes = patch.duration_minutes;
  if (input.passScore !== undefined) sparsePatch.pass_score = patch.pass_score;
  if (input.isPublished !== undefined) sparsePatch.is_published = patch.is_published;
  if (input.isMandatory !== undefined) sparsePatch.is_mandatory = patch.is_mandatory;
  if (input.thumbnailUrl !== undefined) sparsePatch.thumbnail_url = patch.thumbnail_url;
  if (input.prerequisiteCourseId !== undefined) sparsePatch.prerequisite_course_id = patch.prerequisite_course_id;

  const { data, error } =
    Object.keys(sparsePatch).length > 0
      ? await supabaseAdmin.from("courses").update(sparsePatch).eq("id", id).select("*").maybeSingle()
      : { data: await getCourseById(id), error: null };
  if (error) throw error;

  if (input.chapters !== undefined) {
    await replaceCurriculum(id, input.chapters);
  }

  return data as Course | null;
}

export async function countEnrollments(courseId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("enrollments")
    .select("*", { count: "exact", head: true })
    .eq("course_id", courseId);
  if (error) throw error;
  return count ?? 0;
}

export async function deleteCourse(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("courses").delete().eq("id", id);
  if (error) throw error;
}

export async function findEnrollment(userId: string, courseId: string): Promise<Enrollment | null> {
  const { data, error } = await supabaseAdmin
    .from("enrollments")
    .select("*")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (error) throw error;
  return data as Enrollment | null;
}

export async function createEnrollment(userId: string, courseId: string): Promise<Enrollment> {
  const { data, error } = await supabaseAdmin
    .from("enrollments")
    .insert({ user_id: userId, course_id: courseId, status: "in_progress", started_at: new Date().toISOString() })
    .select("*")
    .single();
  if (error) throw error;
  return data as Enrollment;
}

export interface EnrollmentWithCourse {
  enrollment: Enrollment;
  course: Course;
}

// ダッシュボードの「受講中コース一覧」用。supabase-jsの埋め込みselect構文（courses(*)）は
// テスト用のフェイクDBが対応していないため、2回のクエリで取得してアプリ側で結合する。
export async function listEnrollmentsForUser(userId: string): Promise<EnrollmentWithCourse[]> {
  const { data: enrollments, error } = await supabaseAdmin
    .from("enrollments")
    .select("*")
    .eq("user_id", userId)
    .order("started_at", { ascending: false });
  if (error) throw error;
  if (!enrollments || enrollments.length === 0) return [];

  const courseIds = [...new Set(enrollments.map((e) => e.course_id as string))];
  const { data: courses, error: courseError } = await supabaseAdmin.from("courses").select("*").in("id", courseIds);
  if (courseError) throw courseError;

  const courseById = new Map((courses ?? []).map((c) => [c.id as string, c as Course]));

  return (enrollments as Enrollment[]).flatMap((enrollment) => {
    const course = courseById.get(enrollment.course_id);
    return course ? [{ enrollment, course }] : [];
  });
}

export async function getLessonProgressList(enrollmentId: string): Promise<LessonProgress[]> {
  const { data, error } = await supabaseAdmin.from("lesson_progress").select("*").eq("enrollment_id", enrollmentId);
  if (error) throw error;
  return (data ?? []) as LessonProgress[];
}

export async function getLessonById(lessonId: string): Promise<Lesson | null> {
  const { data, error } = await supabaseAdmin.from("lessons").select("*").eq("id", lessonId).maybeSingle();
  if (error) throw error;
  return data as Lesson | null;
}

export interface LessonProgressInput {
  progressPercent?: number;
  lastPositionSeconds?: number;
  completed?: boolean;
  studyTimeDeltaSeconds?: number;
}

export async function upsertLessonProgress(
  enrollmentId: string,
  lessonId: string,
  contentType: ContentType,
  input: LessonProgressInput,
): Promise<LessonProgress> {
  const progressPercent = input.progressPercent ?? 0;
  const isCompleted = input.completed === true || (contentType === "video" && progressPercent >= 80);

  const { data, error } = await supabaseAdmin
    .from("lesson_progress")
    .upsert(
      {
        enrollment_id: enrollmentId,
        lesson_id: lessonId,
        progress_percent: progressPercent,
        last_position_seconds: input.lastPositionSeconds ?? null,
        is_completed: isCompleted,
        completed_at: isCompleted ? new Date().toISOString() : null,
      },
      { onConflict: "enrollment_id,lesson_id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as LessonProgress;
}

// quizRequirementMetは「コースにテストが存在しない」または「合格済みの受験履歴が1件でもある」場合にtrue。
// テスト機能ブロック(quizRepository.ts)側で算出し、呼び出し元(レッスン進捗更新API・テスト回答送信API)から渡す
export async function recalculateEnrollmentProgress(
  enrollmentId: string,
  totalLessonCount: number,
  quizRequirementMet: boolean,
  studyTimeDeltaSeconds = 0,
): Promise<Enrollment> {
  const progressList = await getLessonProgressList(enrollmentId);
  const completedCount = progressList.filter((p) => p.is_completed).length;
  const progressRate = totalLessonCount > 0 ? Math.round((completedCount / totalLessonCount) * 10000) / 100 : 0;
  const allLessonsCompleted = totalLessonCount > 0 && completedCount === totalLessonCount;
  const isCompleted = allLessonsCompleted && quizRequirementMet;

  const { data: current, error: fetchError } = await supabaseAdmin
    .from("enrollments")
    .select("*")
    .eq("id", enrollmentId)
    .single();
  if (fetchError) throw fetchError;

  const { data, error } = await supabaseAdmin
    .from("enrollments")
    .update({
      progress_rate: progressRate,
      total_study_time: (current.total_study_time ?? 0) + studyTimeDeltaSeconds,
      status: isCompleted ? "completed" : "in_progress",
      completed_at: isCompleted ? new Date().toISOString() : current.completed_at,
    })
    .eq("id", enrollmentId)
    .select("*")
    .single();
  if (error) throw error;
  return data as Enrollment;
}
