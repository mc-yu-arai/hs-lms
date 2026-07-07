import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/requireAuth";
import { findOrCreateCertificate } from "../services/certificateRepository";
import { generateCertificatePdf } from "../services/certificatePdfService";
import {
  listCourses,
  getCourseById,
  getChaptersWithLessons,
  createCourse,
  updateCourse,
  deleteCourse,
  countEnrollments,
  countLessonsForCourse,
  findEnrollment,
  createEnrollment,
  getLessonProgressList,
  getLessonById,
  getChapterById,
  upsertLessonProgress,
  recalculateEnrollmentProgress,
  type CourseLevel,
  type ChapterWithLessons,
} from "../services/courseRepository";
import {
  getQuizByCourseId,
  getQuestionsWithChoices,
  createOrReplaceQuiz,
  submitQuizAttempt,
  listAttemptsForEnrollment,
  hasPassedQuiz,
  type QuestionWithChoices,
} from "../services/quizRepository";

export const coursesRouter = Router();

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
    thumbnailUrl: course.thumbnail_url,
    prerequisiteCourseId: course.prerequisite_course_id,
    createdAt: course.created_at,
    updatedAt: course.updated_at,
  };
}

// 未受講者にはコンテンツ本体(URL/本文)を隠し、カリキュラムの構成だけを見せる
function serializeChapters(chapters: ChapterWithLessons[], includeContent: boolean) {
  return chapters.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    displayOrder: chapter.display_order,
    lessons: chapter.lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      contentType: lesson.content_type,
      durationSeconds: lesson.duration_seconds,
      displayOrder: lesson.display_order,
      contentUrl: includeContent ? lesson.content_url : null,
      contentBody: includeContent ? lesson.content_body : null,
    })),
  }));
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

    return res.status(200).json({ courses: courses.map(serializeCourse) });
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

    const enrollment = await findEnrollment(req.appUser!.id, course.id);
    const includeContent = isAdmin(req.appUser!.role) || enrollment !== null;

    const chapters = await getChaptersWithLessons(course.id);

    return res.status(200).json({
      course: serializeCourse(course),
      chapters: serializeChapters(chapters, includeContent),
      enrolled: enrollment !== null,
    });
  }),
);

const lessonSchema = z.object({
  title: z.string().min(1).max(200),
  contentType: z.enum(["video", "pdf", "text", "scorm"]),
  contentUrl: z.string().url().nullable().optional(),
  contentBody: z.string().nullable().optional(),
  durationSeconds: z.number().int().nonnegative().nullable().optional(),
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

    if (course.prerequisite_course_id) {
      const prerequisite = await findEnrollment(req.appUser!.id, course.prerequisite_course_id);
      if (!prerequisite || prerequisite.status !== "completed") {
        throw new HttpError(409, "prerequisite_not_completed", "前提コースの修了が必要です");
      }
    }

    const enrollment = await createEnrollment(req.appUser!.id, course.id);
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

    const input = lessonProgressSchema.parse(req.body);
    await upsertLessonProgress(enrollment.id, lesson.id, lesson.content_type, input);

    const totalLessonCount = await countLessonsForCourse(course.id);
    const quiz = await getQuizByCourseId(course.id);
    const quizRequirementMet = !quiz || (await hasPassedQuiz(enrollment.id, quiz.id));
    const updatedEnrollment = await recalculateEnrollmentProgress(
      enrollment.id,
      totalLessonCount,
      quizRequirementMet,
      input.studyTimeDeltaSeconds ?? 0,
    );

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
});

coursesRouter.post(
  "/:id/quiz",
  requireAuth(),
  requireRole("admin", "super_admin"),
  asyncHandler(async (req, res) => {
    const course = await getCourseById(req.params.id);
    if (!course) throw new HttpError(404, "course_not_found", "コースが見つかりません");

    const input = quizInputSchema.parse(req.body);
    const quiz = await createOrReplaceQuiz(course.id, input);
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

    const { answers } = quizAttemptSchema.parse(req.body);
    const { attempt, questionResults } = await submitQuizAttempt(enrollment.id, quiz, answers, course.pass_score);

    const totalLessonCount = await countLessonsForCourse(course.id);
    const quizRequirementMet = await hasPassedQuiz(enrollment.id, quiz.id);
    const updatedEnrollment = await recalculateEnrollmentProgress(enrollment.id, totalLessonCount, quizRequirementMet, 0);

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
