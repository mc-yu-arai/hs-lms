import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { env } from "../config/env";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/requireAuth";
import { findOrCreateCertificate } from "../services/certificateRepository";
import { generateCertificatePdf } from "../services/certificatePdfService";
import { notifyEnrollmentCompleted, notifyCourseCompleted } from "../services/notificationService";
import {
  listCourses,
  getCourseById,
  getChaptersWithLessons,
  createCourse,
  updateCourse,
  deleteCourse,
  countEnrollments,
  findEnrollment,
  createEnrollment,
  getLessonProgressList,
  getLessonById,
  getChapterById,
  upsertLessonProgress,
  recalculateEnrollmentProgress,
  getAssignedCourseIdsForUserGroups,
  type Course,
  type CourseLevel,
  type ChapterWithLessons,
} from "../services/courseRepository";
import {
  getQuizByCourseId,
  getQuizByChapterId,
  getQuestionsWithChoices,
  createOrReplaceCourseQuiz,
  createOrReplaceChapterQuiz,
  deleteChapterQuiz,
  submitQuizAttempt,
  listAttemptsForEnrollment,
  hasPassedQuiz,
  type QuestionWithChoices,
} from "../services/quizRepository";
import {
  importQuizQuestionsFromCsv,
  importChapterQuizQuestionsFromCsv,
  buildQuizCsvTemplate,
  QuizCsvValidationError,
  type ImportMode,
} from "../services/quizImportService";
import { listGroupsForCourse } from "../services/groupRepository";

export const coursesRouter = Router();

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

function isAdmin(role: string) {
  return role === "admin" || role === "super_admin";
}

function serializeCourse(course: Awaited<ReturnType<typeof getCourseById>>) {
  if (!course) return null;
  return {
    id: course.id,
    title: course.title,
    description: course.description,
    categoryId: course.category_id,
    level: course.level,
    durationMinutes: course.duration_minutes,
    passScore: course.pass_score,
    isPublished: course.is_published,
    isMandatory: course.is_mandatory,
    isLimited: course.is_limited,
    hasFinalQuiz: course.has_final_quiz,
    thumbnailUrl: course.thumbnail_url,
    prerequisiteCourseId: course.prerequisite_course_id,
    createdAt: course.created_at,
    updatedAt: course.updated_at,
  };
}

// 未受講者にはコンテンツ本体(URL/本文)を隠し、カリキュラムの構成だけを見せる。
// ロック中の章(章ロック機能。isLockedがtrueの章)も同様に本体を隠す(限定公開コースと同じ「対象外には
// 中身を見せない」パターン)。locksが渡されない場合(admin/未受講者)は全章アンロック扱いにする
function serializeChapters(chapters: ChapterWithLessons[], includeContent: boolean, locks?: Map<string, boolean>) {
  return chapters.map((chapter) => {
    const isLocked = locks?.get(chapter.id) ?? false;
    const includeChapterContent = includeContent && !isLocked;
    return {
      id: chapter.id,
      title: chapter.title,
      displayOrder: chapter.display_order,
      isLocked,
      lessons: chapter.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        contentType: lesson.content_type,
        durationSeconds: lesson.duration_seconds,
        displayOrder: lesson.display_order,
        contentUrl: includeChapterContent ? lesson.content_url : null,
        contentBody: includeChapterContent ? lesson.content_body : null,
        scormVersion: lesson.scorm_version,
      })),
    };
  });
}

// 章ロックの判定: 章N+1がロックされる ⟺ 章Nに小テストが設定されていて、かつ合格履歴が無い
// (または章N自体が既にロック中で連鎖している場合)。章に小テストが無ければ次章をロックしない。
// 最初の章は常にアンロック。enrollmentIdが無い(admin/未受講者)場合は全章アンロックを返す。
async function computeChapterLocks(chapters: ChapterWithLessons[], enrollmentId: string | null): Promise<Map<string, boolean>> {
  const locks = new Map<string, boolean>();
  let locked = false;
  for (const chapter of chapters) {
    locks.set(chapter.id, enrollmentId ? locked : false);
    if (!enrollmentId) continue;
    const chapterQuiz = await getQuizByChapterId(chapter.id);
    const passed = chapterQuiz ? await hasPassedQuiz(enrollmentId, chapterQuiz.id) : true;
    locked = locked || !passed;
  }
  return locks;
}

// 章内の全レッスンが完了しているか(章テストの受験前提条件チェック用)
function isChapterLessonsComplete(chapter: ChapterWithLessons, progressList: { lesson_id: string; is_completed: boolean }[]): boolean {
  if (chapter.lessons.length === 0) return true;
  return chapter.lessons.every((lesson) => progressList.some((p) => p.lesson_id === lesson.id && p.is_completed));
}

// コース完了条件のうち「テスト系」の要件が全て満たされているか。
// 各章の小テスト(あれば全て)の合格 + コース修了テスト(has_final_quiz=trueの場合のみ必須。
// 未作成なら従来通り要件を満たしたことにする既存の後方互換動作を維持)
async function computeQuizRequirementsMet(course: Course, chapters: ChapterWithLessons[], enrollmentId: string): Promise<boolean> {
  for (const chapter of chapters) {
    const chapterQuiz = await getQuizByChapterId(chapter.id);
    if (chapterQuiz && !(await hasPassedQuiz(enrollmentId, chapterQuiz.id))) return false;
  }
  // DB上はNOT NULL DEFAULT trueのため実運用では必ずboolean値が入るが、テスト用フェイクDBは
  // カラムのデフォルト値を再現しないため、undefinedの場合も「デフォルトのtrue」として扱う
  if (course.has_final_quiz !== false) {
    const finalQuiz = await getQuizByCourseId(course.id);
    if (finalQuiz && !(await hasPassedQuiz(enrollmentId, finalQuiz.id))) return false;
  }
  return true;
}

coursesRouter.get(
  "/",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const querySchema = z.object({
      keyword: z.string().optional(),
      categoryId: z.string().uuid().optional(),
      level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
    });
    const { keyword, categoryId, level } = querySchema.parse(req.query);

    const courses = await listCourses({
      keyword,
      categoryId,
      level: level as CourseLevel | undefined,
      publishedOnly: !isAdmin(req.appUser!.role),
    });

    // 限定公開コースは、所属グループに割り当てられているユーザー(またはadmin)にのみ表示する
    const visibleCourses = isAdmin(req.appUser!.role)
      ? courses
      : await (async () => {
          const assignedCourseIds = await getAssignedCourseIdsForUserGroups(req.appUser!.id);
          return courses.filter((c) => !c.is_limited || assignedCourseIds.has(c.id));
        })();

    return res.status(200).json({ courses: visibleCourses.map(serializeCourse) });
  }),
);

coursesRouter.get(
  "/:id",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const course = await getCourseById(req.params.id);
    if (!course || (!course.is_published && !isAdmin(req.appUser!.role))) {
      throw new HttpError(404, "course_not_found", "コースが見つかりません");
    }

    if (course.is_limited && !isAdmin(req.appUser!.role)) {
      const assignedCourseIds = await getAssignedCourseIdsForUserGroups(req.appUser!.id);
      if (!assignedCourseIds.has(course.id)) {
        throw new HttpError(404, "course_not_found", "コースが見つかりません");
      }
    }

    const enrollment = await findEnrollment(req.appUser!.id, course.id);
    const includeContent = isAdmin(req.appUser!.role) || enrollment !== null;

    const chapters = await getChaptersWithLessons(course.id);
    // adminは章ロックの対象外(常に全章アンロックとして扱う)
    const locks = isAdmin(req.appUser!.role) ? undefined : await computeChapterLocks(chapters, enrollment?.id ?? null);

    return res.status(200).json({
      course: serializeCourse(course),
      chapters: serializeChapters(chapters, includeContent, locks),
      enrolled: enrollment !== null,
    });
  }),
);

const lessonSchema = z.object({
  title: z.string().min(1).max(200),
  contentType: z.enum(["video", "pdf", "text", "scorm", "learnwiz"]),
  // scorm/learnwizはStorage相対パス(例: lesson-content/{uuid}/index.html)を格納するため、
  // 完全なURLに限定せず空文字でない文字列を許容する
  contentUrl: z.string().min(1).nullable().optional(),
  contentBody: z.string().nullable().optional(),
  durationSeconds: z.number().int().nonnegative().nullable().optional(),
  scormVersion: z.enum(["1.2", "2004"]).nullable().optional(),
});

const chapterSchema = z.object({
  title: z.string().min(1).max(200),
  lessons: z.array(lessonSchema).default([]),
});

const courseCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  durationMinutes: z.number().int().nonnegative().nullable().optional(),
  passScore: z.number().int().min(0).max(100).optional(),
  isPublished: z.boolean().optional(),
  isMandatory: z.boolean().optional(),
  isLimited: z.boolean().optional(),
  hasFinalQuiz: z.boolean().optional(),
  thumbnailUrl: z.string().url().nullable().optional(),
  prerequisiteCourseId: z.string().uuid().nullable().optional(),
  chapters: z.array(chapterSchema).default([]),
});

coursesRouter.post(
  "/",
  requireAuth(),
  requireRole("admin", "super_admin"),
  asyncHandler(async (req, res) => {
    const input = courseCreateSchema.parse(req.body);
    const course = await createCourse(input);
    return res.status(201).json({ course: serializeCourse(course) });
  }),
);

const courseUpdateSchema = courseCreateSchema.partial();

coursesRouter.put(
  "/:id",
  requireAuth(),
  requireRole("admin", "super_admin"),
  asyncHandler(async (req, res) => {
    const existing = await getCourseById(req.params.id);
    if (!existing) throw new HttpError(404, "course_not_found", "コースが見つかりません");

    const input = courseUpdateSchema.parse(req.body);
    const course = await updateCourse(req.params.id, input);
    return res.status(200).json({ course: serializeCourse(course) });
  }),
);

coursesRouter.get(
  "/:id/groups",
  requireAuth(),
  requireRole("admin", "super_admin"),
  asyncHandler(async (req, res) => {
    const course = await getCourseById(req.params.id);
    if (!course) throw new HttpError(404, "course_not_found", "コースが見つかりません");

    const groups = await listGroupsForCourse(course.id);
    return res.status(200).json({
      groups: groups.map((g) => ({
        id: g.id,
        assignedAt: g.assigned_at,
        group: { id: g.group.id, name: g.group.name, description: g.group.description },
      })),
    });
  }),
);

coursesRouter.delete(
  "/:id",
  requireAuth(),
  requireRole("admin", "super_admin"),
  asyncHandler(async (req, res) => {
    const existing = await getCourseById(req.params.id);
    if (!existing) throw new HttpError(404, "course_not_found", "コースが見つかりません");

    const enrollmentCount = await countEnrollments(req.params.id);
    if (enrollmentCount > 0) {
      throw new HttpError(
        409,
        "course_has_enrollments",
        "受講履歴が存在するコースは削除できません。非公開化（isPublished: false）をご検討ください",
      );
    }

    await deleteCourse(req.params.id);
    return res.status(200).json({ message: "コースを削除しました" });
  }),
);

coursesRouter.post(
  "/:id/enroll",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const course = await getCourseById(req.params.id);
    if (!course || !course.is_published) {
      throw new HttpError(404, "course_not_found", "コースが見つかりません");
    }

    const existing = await findEnrollment(req.appUser!.id, course.id);
    if (existing) {
      return res.status(200).json({ enrollment: existing });
    }

    if (course.is_limited && !isAdmin(req.appUser!.role)) {
      const assignedCourseIds = await getAssignedCourseIdsForUserGroups(req.appUser!.id);
      if (!assignedCourseIds.has(course.id)) {
        throw new HttpError(404, "course_not_found", "コースが見つかりません");
      }
    }

    if (course.prerequisite_course_id) {
      const prerequisite = await findEnrollment(req.appUser!.id, course.prerequisite_course_id);
      if (!prerequisite || prerequisite.status !== "completed") {
        throw new HttpError(409, "prerequisite_not_completed", "前提コースの修了が必要です");
      }
    }

    const enrollment = await createEnrollment(req.appUser!.id, course.id);
    await notifyEnrollmentCompleted(req.appUser!.id, course.id);
    return res.status(201).json({ enrollment });
  }),
);

coursesRouter.get(
  "/:id/progress",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const course = await getCourseById(req.params.id);
    if (!course) throw new HttpError(404, "course_not_found", "コースが見つかりません");

    const enrollment = await findEnrollment(req.appUser!.id, course.id);
    if (!enrollment) throw new HttpError(404, "not_enrolled", "このコースを受講していません");

    const [progressList, chapters] = await Promise.all([
      getLessonProgressList(enrollment.id),
      getChaptersWithLessons(course.id),
    ]);

    const lessons = chapters.flatMap((chapter) =>
      chapter.lessons.map((lesson) => {
        const progress = progressList.find((p) => p.lesson_id === lesson.id);
        return {
          lessonId: lesson.id,
          title: lesson.title,
          isCompleted: progress?.is_completed ?? false,
          progressPercent: progress?.progress_percent ?? 0,
          lastPositionSeconds: progress?.last_position_seconds ?? null,
        };
      }),
    );

    return res.status(200).json({
      enrollment: {
        id: enrollment.id,
        status: enrollment.status,
        progressRate: enrollment.progress_rate,
        totalStudyTime: enrollment.total_study_time,
        startedAt: enrollment.started_at,
        completedAt: enrollment.completed_at,
        dueDate: enrollment.due_date,
      },
      lessons,
    });
  }),
);

const lessonProgressSchema = z.object({
  progressPercent: z.number().min(0).max(100).optional(),
  lastPositionSeconds: z.number().int().nonnegative().optional(),
  completed: z.boolean().optional(),
  studyTimeDeltaSeconds: z.number().int().nonnegative().optional(),
});

coursesRouter.put(
  "/:id/lessons/:lessonId/progress",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const course = await getCourseById(req.params.id);
    if (!course) throw new HttpError(404, "course_not_found", "コースが見つかりません");

    const enrollment = await findEnrollment(req.appUser!.id, course.id);
    if (!enrollment) throw new HttpError(404, "not_enrolled", "このコースを受講していません");

    const lesson = await getLessonById(req.params.lessonId);
    if (!lesson) throw new HttpError(404, "lesson_not_found", "レッスンが見つかりません");

    const chapter = await getChapterById(lesson.chapter_id);
    if (!chapter || chapter.course_id !== course.id) {
      throw new HttpError(404, "lesson_not_found", "レッスンが見つかりません");
    }

    const chapters = await getChaptersWithLessons(course.id);
    if (!isAdmin(req.appUser!.role)) {
      const locks = await computeChapterLocks(chapters, enrollment.id);
      if (locks.get(chapter.id)) {
        throw new HttpError(403, "chapter_locked", "前の章の小テストに合格していないため、このレッスンにはまだアクセスできません");
      }
    }

    const wasCompleted = enrollment.status === "completed";

    const input = lessonProgressSchema.parse(req.body);
    await upsertLessonProgress(enrollment.id, lesson.id, lesson.content_type, input);

    const totalLessonCount = chapters.reduce((sum, c) => sum + c.lessons.length, 0);
    const quizRequirementMet = await computeQuizRequirementsMet(course, chapters, enrollment.id);
    const updatedEnrollment = await recalculateEnrollmentProgress(
      enrollment.id,
      totalLessonCount,
      quizRequirementMet,
      input.studyTimeDeltaSeconds ?? 0,
    );

    if (!wasCompleted && updatedEnrollment.status === "completed") {
      await notifyCourseCompleted(req.appUser!.id, course.id);
    }

    return res.status(200).json({
      enrollment: {
        id: updatedEnrollment.id,
        status: updatedEnrollment.status,
        progressRate: updatedEnrollment.progress_rate,
        totalStudyTime: updatedEnrollment.total_study_time,
        completedAt: updatedEnrollment.completed_at,
      },
    });
  }),
);

// 未受講者・非adminには正解(isCorrect)を隠す
function serializeQuestions(questions: QuestionWithChoices[], includeAnswers: boolean) {
  return questions.map((question) => ({
    id: question.id,
    questionText: question.question_text,
    questionType: question.question_type,
    displayOrder: question.display_order,
    choices: question.choices.map((choice) => ({
      id: choice.id,
      choiceText: choice.choice_text,
      displayOrder: choice.display_order,
      ...(includeAnswers ? { isCorrect: choice.is_correct } : {}),
    })),
  }));
}

coursesRouter.get(
  "/:id/quiz",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const course = await getCourseById(req.params.id);
    if (!course) throw new HttpError(404, "course_not_found", "コースが見つかりません");

    const quiz = await getQuizByCourseId(course.id);
    if (!quiz) throw new HttpError(404, "quiz_not_found", "このコースにテストは設定されていません");

    const admin = isAdmin(req.appUser!.role);
    if (!admin) {
      const enrollment = await findEnrollment(req.appUser!.id, course.id);
      if (!enrollment) throw new HttpError(404, "not_enrolled", "このコースを受講していません");
    }

    const questions = await getQuestionsWithChoices(quiz.id);

    return res.status(200).json({
      quiz: { id: quiz.id, title: quiz.title, description: quiz.description, passScore: course.pass_score },
      questions: serializeQuestions(questions, admin),
    });
  }),
);

const choiceInputSchema = z.object({
  choiceText: z.string().min(1).max(500),
  isCorrect: z.boolean(),
});

const questionInputSchema = z
  .object({
    questionText: z.string().min(1),
    questionType: z.enum(["single_choice", "multiple_choice"]),
    choices: z.array(choiceInputSchema).min(2),
  })
  .superRefine((question, ctx) => {
    const correctCount = question.choices.filter((c) => c.isCorrect).length;
    if (correctCount === 0) {
      ctx.addIssue({ code: "custom", message: "正解の選択肢を1つ以上指定してください", path: ["choices"] });
    }
    if (question.questionType === "single_choice" && correctCount > 1) {
      ctx.addIssue({ code: "custom", message: "単一選択問題の正解は1つだけにしてください", path: ["choices"] });
    }
  });

const quizInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  questions: z.array(questionInputSchema).min(1),
  // 章テストのみ使用。コース修了テストは指定されても無視され、courses.pass_scoreのまま
  passScore: z.number().int().min(0).max(100).optional(),
});

coursesRouter.post(
  "/:id/quiz",
  requireAuth(),
  requireRole("admin", "super_admin"),
  asyncHandler(async (req, res) => {
    const course = await getCourseById(req.params.id);
    if (!course) throw new HttpError(404, "course_not_found", "コースが見つかりません");

    const input = quizInputSchema.parse(req.body);
    const quiz = await createOrReplaceCourseQuiz(course.id, input);
    const questions = await getQuestionsWithChoices(quiz.id);

    return res.status(200).json({
      quiz: { id: quiz.id, title: quiz.title, description: quiz.description, passScore: course.pass_score },
      questions: serializeQuestions(questions, true),
    });
  }),
);

const quizAttemptSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().min(1),
      choiceIds: z.array(z.string().min(1)).default([]),
    }),
  ),
});

coursesRouter.post(
  "/:id/quiz/attempts",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const course = await getCourseById(req.params.id);
    if (!course) throw new HttpError(404, "course_not_found", "コースが見つかりません");

    const enrollment = await findEnrollment(req.appUser!.id, course.id);
    if (!enrollment) throw new HttpError(404, "not_enrolled", "このコースを受講していません");

    const quiz = await getQuizByCourseId(course.id);
    if (!quiz) throw new HttpError(404, "quiz_not_found", "このコースにテストは設定されていません");

    const wasCompleted = enrollment.status === "completed";

    const { answers } = quizAttemptSchema.parse(req.body);
    const { attempt, questionResults } = await submitQuizAttempt(enrollment.id, quiz, answers, course.pass_score);

    const chapters = await getChaptersWithLessons(course.id);
    const totalLessonCount = chapters.reduce((sum, c) => sum + c.lessons.length, 0);
    const quizRequirementMet = await computeQuizRequirementsMet(course, chapters, enrollment.id);
    const updatedEnrollment = await recalculateEnrollmentProgress(enrollment.id, totalLessonCount, quizRequirementMet, 0);

    if (!wasCompleted && updatedEnrollment.status === "completed") {
      await notifyCourseCompleted(req.appUser!.id, course.id);
    }

    return res.status(201).json({
      attempt: { id: attempt.id, score: attempt.score, isPassed: attempt.is_passed, submittedAt: attempt.submitted_at },
      questionResults,
      enrollment: {
        id: updatedEnrollment.id,
        status: updatedEnrollment.status,
        progressRate: updatedEnrollment.progress_rate,
        completedAt: updatedEnrollment.completed_at,
      },
    });
  }),
);

coursesRouter.get(
  "/:id/quiz/attempts",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const course = await getCourseById(req.params.id);
    if (!course) throw new HttpError(404, "course_not_found", "コースが見つかりません");

    const enrollment = await findEnrollment(req.appUser!.id, course.id);
    if (!enrollment) throw new HttpError(404, "not_enrolled", "このコースを受講していません");

    const quiz = await getQuizByCourseId(course.id);
    if (!quiz) throw new HttpError(404, "quiz_not_found", "このコースにテストは設定されていません");

    const attempts = await listAttemptsForEnrollment(enrollment.id, quiz.id);

    return res.status(200).json({
      attempts: attempts.map((a) => ({ id: a.id, score: a.score, isPassed: a.is_passed, submittedAt: a.submitted_at })),
    });
  }),
);

// courseIdに属するchapterIdかどうかを検証する共通ヘルパー(章テスト系エンドポイントで共通)
async function getValidChapter(courseId: string, chapterId: string) {
  const chapter = await getChapterById(chapterId);
  if (!chapter || chapter.course_id !== courseId) {
    throw new HttpError(404, "chapter_not_found", "章が見つかりません");
  }
  return chapter;
}

coursesRouter.get(
  "/:id/chapters/:chapterId/quiz",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const course = await getCourseById(req.params.id);
    if (!course) throw new HttpError(404, "course_not_found", "コースが見つかりません");
    await getValidChapter(course.id, req.params.chapterId);

    const quiz = await getQuizByChapterId(req.params.chapterId);
    if (!quiz) throw new HttpError(404, "quiz_not_found", "この章に小テストは設定されていません");

    const admin = isAdmin(req.appUser!.role);
    if (!admin) {
      const enrollment = await findEnrollment(req.appUser!.id, course.id);
      if (!enrollment) throw new HttpError(404, "not_enrolled", "このコースを受講していません");
    }

    const questions = await getQuestionsWithChoices(quiz.id);

    return res.status(200).json({
      quiz: { id: quiz.id, title: quiz.title, description: quiz.description, passScore: quiz.pass_score },
      questions: serializeQuestions(questions, admin),
    });
  }),
);

coursesRouter.post(
  "/:id/chapters/:chapterId/quiz",
  requireAuth(),
  requireRole("admin", "super_admin"),
  asyncHandler(async (req, res) => {
    const course = await getCourseById(req.params.id);
    if (!course) throw new HttpError(404, "course_not_found", "コースが見つかりません");
    await getValidChapter(course.id, req.params.chapterId);

    const input = quizInputSchema.parse(req.body);
    const quiz = await createOrReplaceChapterQuiz(course.id, req.params.chapterId, input);
    const questions = await getQuestionsWithChoices(quiz.id);

    return res.status(200).json({
      quiz: { id: quiz.id, title: quiz.title, description: quiz.description, passScore: quiz.pass_score },
      questions: serializeQuestions(questions, true),
    });
  }),
);

coursesRouter.delete(
  "/:id/chapters/:chapterId/quiz",
  requireAuth(),
  requireRole("admin", "super_admin"),
  asyncHandler(async (req, res) => {
    const course = await getCourseById(req.params.id);
    if (!course) throw new HttpError(404, "course_not_found", "コースが見つかりません");
    await getValidChapter(course.id, req.params.chapterId);

    const deleted = await deleteChapterQuiz(req.params.chapterId);
    if (!deleted) throw new HttpError(404, "quiz_not_found", "この章に小テストは設定されていません");

    return res.status(200).json({ message: "章テストを削除しました" });
  }),
);

coursesRouter.post(
  "/:id/chapters/:chapterId/quiz/attempts",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const course = await getCourseById(req.params.id);
    if (!course) throw new HttpError(404, "course_not_found", "コースが見つかりません");
    const chapter = await getValidChapter(course.id, req.params.chapterId);

    const enrollment = await findEnrollment(req.appUser!.id, course.id);
    if (!enrollment) throw new HttpError(404, "not_enrolled", "このコースを受講していません");

    const quiz = await getQuizByChapterId(chapter.id);
    if (!quiz) throw new HttpError(404, "quiz_not_found", "この章に小テストは設定されていません");

    // 「章の全レッスン完了後に任意のタイミングで受ける」という確定パラメータのサーバー側チェック。
    // 章がロックされている場合、そもそもこの章のレッスン進捗を記録できない(PUT .../progressが403を返す)ため
    // 必然的にここでも未完了判定になり、結果的に章ロックの防御としても機能する
    const chaptersWithLessons = await getChaptersWithLessons(course.id);
    const targetChapter = chaptersWithLessons.find((c) => c.id === chapter.id)!;
    const progressList = await getLessonProgressList(enrollment.id);
    if (!isChapterLessonsComplete(targetChapter, progressList)) {
      throw new HttpError(409, "chapter_lessons_incomplete", "この章の全レッスンを完了してから受験してください");
    }

    const wasCompleted = enrollment.status === "completed";

    const { answers } = quizAttemptSchema.parse(req.body);
    // 章テストはquiz.pass_score(章ごとに個別設定可能。0の場合は結果にかかわらず全員合格)で採点する。
    // コース修了テストのcourse.pass_scoreとは切り離されている
    const { attempt, questionResults } = await submitQuizAttempt(enrollment.id, quiz, answers, quiz.pass_score);

    const totalLessonCount = chaptersWithLessons.reduce((sum, c) => sum + c.lessons.length, 0);
    const quizRequirementMet = await computeQuizRequirementsMet(course, chaptersWithLessons, enrollment.id);
    const updatedEnrollment = await recalculateEnrollmentProgress(enrollment.id, totalLessonCount, quizRequirementMet, 0);

    if (!wasCompleted && updatedEnrollment.status === "completed") {
      await notifyCourseCompleted(req.appUser!.id, course.id);
    }

    return res.status(201).json({
      attempt: { id: attempt.id, score: attempt.score, isPassed: attempt.is_passed, submittedAt: attempt.submitted_at },
      questionResults,
      enrollment: {
        id: updatedEnrollment.id,
        status: updatedEnrollment.status,
        progressRate: updatedEnrollment.progress_rate,
        completedAt: updatedEnrollment.completed_at,
      },
    });
  }),
);

coursesRouter.get(
  "/:id/chapters/:chapterId/quiz/attempts",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const course = await getCourseById(req.params.id);
    if (!course) throw new HttpError(404, "course_not_found", "コースが見つかりません");
    await getValidChapter(course.id, req.params.chapterId);

    const enrollment = await findEnrollment(req.appUser!.id, course.id);
    if (!enrollment) throw new HttpError(404, "not_enrolled", "このコースを受講していません");

    const quiz = await getQuizByChapterId(req.params.chapterId);
    if (!quiz) throw new HttpError(404, "quiz_not_found", "この章に小テストは設定されていません");

    const attempts = await listAttemptsForEnrollment(enrollment.id, quiz.id);

    return res.status(200).json({
      attempts: attempts.map((a) => ({ id: a.id, score: a.score, isPassed: a.is_passed, submittedAt: a.submitted_at })),
    });
  }),
);

const importModeSchema = z.enum(["append", "replace"]);

coursesRouter.post(
  "/:id/quiz/import",
  requireAuth(),
  requireRole("admin", "super_admin"),
  csvUpload.single("file"),
  asyncHandler(async (req, res) => {
    const course = await getCourseById(req.params.id);
    if (!course) throw new HttpError(404, "course_not_found", "コースが見つかりません");

    if (!req.file) {
      throw new HttpError(400, "file_required", "CSVファイルを指定してください");
    }

    const modeResult = importModeSchema.safeParse(req.query.mode);
    if (!modeResult.success) {
      throw new HttpError(400, "invalid_mode", "modeはappendまたはreplaceで指定してください");
    }
    const mode: ImportMode = modeResult.data;

    try {
      const result = await importQuizQuestionsFromCsv(course.id, req.file.buffer.toString("utf-8"), mode);
      return res.status(201).json({
        quiz: { id: result.quiz.id, title: result.quiz.title, description: result.quiz.description, passScore: course.pass_score },
        questions: serializeQuestions(result.questions, true),
        importedCount: result.importedCount,
      });
    } catch (err) {
      if (err instanceof QuizCsvValidationError) {
        return res.status(400).json({
          error: { code: "csv_validation_error", message: err.message, rowErrors: err.rowErrors },
        });
      }
      throw err;
    }
  }),
);

coursesRouter.get(
  "/:id/quiz/import/template",
  requireAuth(),
  requireRole("admin", "super_admin"),
  asyncHandler(async (req, res) => {
    const course = await getCourseById(req.params.id);
    if (!course) throw new HttpError(404, "course_not_found", "コースが見つかりません");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="quiz_import_template.csv"');
    return res.status(200).send(buildQuizCsvTemplate());
  }),
);

coursesRouter.post(
  "/:id/chapters/:chapterId/quiz/import",
  requireAuth(),
  requireRole("admin", "super_admin"),
  csvUpload.single("file"),
  asyncHandler(async (req, res) => {
    const course = await getCourseById(req.params.id);
    if (!course) throw new HttpError(404, "course_not_found", "コースが見つかりません");
    await getValidChapter(course.id, req.params.chapterId);

    if (!req.file) {
      throw new HttpError(400, "file_required", "CSVファイルを指定してください");
    }

    const modeResult = importModeSchema.safeParse(req.query.mode);
    if (!modeResult.success) {
      throw new HttpError(400, "invalid_mode", "modeはappendまたはreplaceで指定してください");
    }
    const mode: ImportMode = modeResult.data;

    try {
      const result = await importChapterQuizQuestionsFromCsv(course.id, req.params.chapterId, req.file.buffer.toString("utf-8"), mode);
      return res.status(201).json({
        quiz: { id: result.quiz.id, title: result.quiz.title, description: result.quiz.description, passScore: result.quiz.pass_score },
        questions: serializeQuestions(result.questions, true),
        importedCount: result.importedCount,
      });
    } catch (err) {
      if (err instanceof QuizCsvValidationError) {
        return res.status(400).json({
          error: { code: "csv_validation_error", message: err.message, rowErrors: err.rowErrors },
        });
      }
      throw err;
    }
  }),
);

coursesRouter.get(
  "/:id/chapters/:chapterId/quiz/import/template",
  requireAuth(),
  requireRole("admin", "super_admin"),
  asyncHandler(async (req, res) => {
    const course = await getCourseById(req.params.id);
    if (!course) throw new HttpError(404, "course_not_found", "コースが見つかりません");
    await getValidChapter(course.id, req.params.chapterId);

    // テンプレートの列構成はコース修了テスト・章テストで共通のため、生成ロジックはbuildQuizCsvTemplate()を流用する
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="quiz_import_template.csv"');
    return res.status(200).send(buildQuizCsvTemplate());
  }),
);

async function requireCompletedEnrollment(userId: string, courseId: string) {
  const enrollment = await findEnrollment(userId, courseId);
  if (!enrollment || enrollment.status !== "completed") {
    throw new HttpError(409, "course_not_completed", "このコースはまだ修了していません");
  }
  return enrollment;
}

coursesRouter.post(
  "/:id/certificate",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const course = await getCourseById(req.params.id);
    if (!course) throw new HttpError(404, "course_not_found", "コースが見つかりません");

    await requireCompletedEnrollment(req.appUser!.id, course.id);
    const { certificate, created } = await findOrCreateCertificate(req.appUser!.id, course.id);

    return res.status(created ? 201 : 200).json({
      certificate: {
        id: certificate.id,
        courseId: certificate.course_id,
        issuedAt: certificate.issued_at,
        verificationUuid: certificate.verification_uuid,
      },
    });
  }),
);

coursesRouter.get(
  "/:id/certificate/download",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const course = await getCourseById(req.params.id);
    if (!course) throw new HttpError(404, "course_not_found", "コースが見つかりません");

    await requireCompletedEnrollment(req.appUser!.id, course.id);
    const { certificate } = await findOrCreateCertificate(req.appUser!.id, course.id);

    const learnerName = `${req.appUser!.last_name} ${req.appUser!.first_name}`;
    const verifyUrl = `${env.FRONTEND_URL}/certificates/${certificate.verification_uuid}`;

    const pdfBuffer = await generateCertificatePdf({
      learnerName,
      courseTitle: course.title,
      issuedAt: certificate.issued_at,
      verifyUrl,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="certificate.pdf"');
    return res.status(200).send(pdfBuffer);
  }),
);
