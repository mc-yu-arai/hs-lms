import request from "supertest";

jest.mock("../src/lib/supabase", () => {
  const { createFakeDb } = require("./helpers/fakeSupabase");
  const fakeDb = createFakeDb();

  return {
    __fakeDb: fakeDb,
    supabaseAdmin: {
      from: fakeDb.from,
      auth: {
        getUser: async (token: string) => {
          const id = token.replace("access-", "");
          const user = fakeDb.store.get("users")?.find((u: any) => u.id === id);
          return user
            ? { data: { user: { id, email: user.email } }, error: null }
            : { data: { user: null }, error: { message: "invalid token" } };
        },
        admin: { signOut: jest.fn(async () => ({ error: null })) },
      },
    },
    supabaseAuth: { auth: { signInWithPassword: jest.fn() } },
  };
});

import { createApp } from "../src/app";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const supabaseModule = require("../src/lib/supabase");
const fakeDb = supabaseModule.__fakeDb as ReturnType<typeof import("./helpers/fakeSupabase").createFakeDb>;

function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
  const id = (overrides.id as string) ?? `user-${Math.random().toString(36).slice(2, 8)}`;
  const user = {
    id,
    email: `${id}@example.com`,
    role: "learner",
    is_active: true,
    last_name: "山田",
    first_name: "太郎",
    totp_enabled: false,
    ...overrides,
  };
  fakeDb.store.get("users")!.push(user);
  return user;
}

function authHeader(user: { id: string }) {
  return { Authorization: `Bearer access-${user.id}` };
}

function makeCourseRow(overrides: Partial<Record<string, unknown>> = {}) {
  const id = (overrides.id as string) ?? `course-${Math.random().toString(36).slice(2, 8)}`;
  const course = {
    id,
    title: "テストコース",
    description: null,
    category_id: null,
    level: "beginner",
    duration_minutes: 60,
    pass_score: 70,
    is_published: true,
    is_mandatory: false,
    is_limited: false,
    has_final_quiz: true,
    thumbnail_url: null,
    prerequisite_course_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
  fakeDb.store.get("courses")!.push(course);
  return course;
}

function makeChapter(courseId: string, overrides: Partial<Record<string, unknown>> = {}) {
  const chapter = {
    id: (overrides.id as string) ?? `chapter-${Math.random().toString(36).slice(2, 8)}`,
    course_id: courseId,
    title: "章",
    display_order: 0,
    ...overrides,
  };
  fakeDb.store.get("chapters")!.push(chapter);
  return chapter;
}

function makeLesson(chapterId: string, overrides: Partial<Record<string, unknown>> = {}) {
  const lesson = {
    id: (overrides.id as string) ?? `lesson-${Math.random().toString(36).slice(2, 8)}`,
    chapter_id: chapterId,
    title: "レッスン",
    content_type: "text",
    content_url: null,
    content_body: "本文",
    duration_seconds: null,
    display_order: 0,
    scorm_version: null,
    ...overrides,
  };
  fakeDb.store.get("lessons")!.push(lesson);
  return lesson;
}

function enroll(user: { id: string }, course: { id: string }) {
  const enrollment = {
    id: `enr-${Math.random().toString(36).slice(2, 8)}`,
    user_id: user.id,
    course_id: course.id,
    status: "in_progress",
    progress_rate: 0,
    total_study_time: 0,
    started_at: new Date().toISOString(),
    completed_at: null,
    due_date: null,
  };
  fakeDb.store.get("enrollments")!.push(enrollment);
  return enrollment;
}

function quizPayload(title: string) {
  return {
    title,
    questions: [
      {
        questionText: "Q1: 正しいものを1つ選んでください",
        questionType: "single_choice",
        choices: [
          { choiceText: "A(正)", isCorrect: true },
          { choiceText: "B", isCorrect: false },
        ],
      },
    ],
  };
}

beforeEach(() => {
  for (const t of [
    "users",
    "categories",
    "courses",
    "chapters",
    "lessons",
    "enrollments",
    "lesson_progress",
    "quizzes",
    "questions",
    "choices",
    "quiz_attempts",
    "quiz_answers",
  ]) {
    fakeDb.store.set(t, []);
  }
});

describe("POST /v1/courses/:id/chapters/:chapterId/quiz", () => {
  it("forbids non-admin roles", async () => {
    const learner = makeUser({ role: "learner" });
    const course = makeCourseRow({});
    const chapter = makeChapter(course.id);
    const res = await request(createApp())
      .post(`/v1/courses/${course.id}/chapters/${chapter.id}/quiz`)
      .set(authHeader(learner))
      .send(quizPayload("章テスト"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when the chapter does not belong to the course", async () => {
    const admin = makeUser({ role: "admin" });
    const course = makeCourseRow({});
    const otherCourse = makeCourseRow({});
    const chapterOfOtherCourse = makeChapter(otherCourse.id);
    const res = await request(createApp())
      .post(`/v1/courses/${course.id}/chapters/${chapterOfOtherCourse.id}/quiz`)
      .set(authHeader(admin))
      .send(quizPayload("章テスト"));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("chapter_not_found");
  });

  it("creates a chapter quiz independently from the course's final quiz", async () => {
    const admin = makeUser({ role: "admin" });
    const course = makeCourseRow({});
    const chapter = makeChapter(course.id);

    const chapterRes = await request(createApp())
      .post(`/v1/courses/${course.id}/chapters/${chapter.id}/quiz`)
      .set(authHeader(admin))
      .send(quizPayload("章テスト"));
    expect(chapterRes.status).toBe(200);

    const finalRes = await request(createApp())
      .post(`/v1/courses/${course.id}/quiz`)
      .set(authHeader(admin))
      .send(quizPayload("修了テスト"));
    expect(finalRes.status).toBe(200);

    expect(fakeDb.store.get("quizzes")).toHaveLength(2);

    const courseQuizRes = await request(createApp()).get(`/v1/courses/${course.id}/quiz`).set(authHeader(admin));
    expect(courseQuizRes.body.quiz.title).toBe("修了テスト");

    const chapterQuizRes = await request(createApp())
      .get(`/v1/courses/${course.id}/chapters/${chapter.id}/quiz`)
      .set(authHeader(admin));
    expect(chapterQuizRes.body.quiz.title).toBe("章テスト");
  });
});

describe("GET /v1/courses/:id/chapters/:chapterId/quiz", () => {
  it("returns 404 when the chapter has no quiz", async () => {
    const learner = makeUser({});
    const course = makeCourseRow({});
    const chapter = makeChapter(course.id);
    const res = await request(createApp())
      .get(`/v1/courses/${course.id}/chapters/${chapter.id}/quiz`)
      .set(authHeader(learner));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("quiz_not_found");
  });

  it("requires enrollment for learners, but not for admins", async () => {
    const admin = makeUser({ role: "admin" });
    const course = makeCourseRow({});
    const chapter = makeChapter(course.id);
    await request(createApp())
      .post(`/v1/courses/${course.id}/chapters/${chapter.id}/quiz`)
      .set(authHeader(admin))
      .send(quizPayload("章テスト"));

    const learner = makeUser({});
    const notEnrolledRes = await request(createApp())
      .get(`/v1/courses/${course.id}/chapters/${chapter.id}/quiz`)
      .set(authHeader(learner));
    expect(notEnrolledRes.status).toBe(404);
    expect(notEnrolledRes.body.error.code).toBe("not_enrolled");

    const adminRes = await request(createApp())
      .get(`/v1/courses/${course.id}/chapters/${chapter.id}/quiz`)
      .set(authHeader(admin));
    expect(adminRes.status).toBe(200);
  });
});

describe("POST /v1/courses/:id/chapters/:chapterId/quiz/attempts", () => {
  it("rejects an attempt with 409 until all lessons in the chapter are completed", async () => {
    const admin = makeUser({ role: "admin" });
    const course = makeCourseRow({});
    const chapter = makeChapter(course.id);
    const lesson = makeLesson(chapter.id);

    const createRes = await request(createApp())
      .post(`/v1/courses/${course.id}/chapters/${chapter.id}/quiz`)
      .set(authHeader(admin))
      .send(quizPayload("章テスト"));
    const question = createRes.body.questions[0];
    const correctChoiceId = question.choices.find((c: any) => c.isCorrect).id;

    const learner = makeUser({});
    enroll(learner, course);

    const tooEarlyRes = await request(createApp())
      .post(`/v1/courses/${course.id}/chapters/${chapter.id}/quiz/attempts`)
      .set(authHeader(learner))
      .send({ answers: [{ questionId: question.id, choiceIds: [correctChoiceId] }] });
    expect(tooEarlyRes.status).toBe(409);
    expect(tooEarlyRes.body.error.code).toBe("chapter_lessons_incomplete");

    await request(createApp())
      .put(`/v1/courses/${course.id}/lessons/${lesson.id}/progress`)
      .set(authHeader(learner))
      .send({ completed: true });

    const okRes = await request(createApp())
      .post(`/v1/courses/${course.id}/chapters/${chapter.id}/quiz/attempts`)
      .set(authHeader(learner))
      .send({ answers: [{ questionId: question.id, choiceIds: [correctChoiceId] }] });
    expect(okRes.status).toBe(201);
    expect(okRes.body.attempt.isPassed).toBe(true);
  });
});

describe("章ロック(chapter lock)", () => {
  async function setupTwoChapterCourse(hasFinalQuiz = false) {
    const admin = makeUser({ role: "admin" });
    const course = makeCourseRow({ has_final_quiz: hasFinalQuiz });
    const chapter1 = makeChapter(course.id, { display_order: 0, title: "第1章" });
    const lesson1 = makeLesson(chapter1.id, { display_order: 0 });
    const chapter2 = makeChapter(course.id, { display_order: 1, title: "第2章" });
    const lesson2 = makeLesson(chapter2.id, { display_order: 0 });

    const chapterQuizRes = await request(createApp())
      .post(`/v1/courses/${course.id}/chapters/${chapter1.id}/quiz`)
      .set(authHeader(admin))
      .send(quizPayload("第1章の小テスト"));
    const question = chapterQuizRes.body.questions[0];
    const correctChoiceId = question.choices.find((c: any) => c.isCorrect).id;

    return { admin, course, chapter1, lesson1, chapter2, lesson2, question, correctChoiceId };
  }

  it("locks the next chapter until the previous chapter's quiz is passed, and unlocks it after passing", async () => {
    const { course, chapter1, lesson1, chapter2, lesson2, question, correctChoiceId } = await setupTwoChapterCourse();
    const learner = makeUser({});
    enroll(learner, course);

    // 第2章はまだロック中: GET /:idでisLocked=true、レッスン進捗更新は403
    const detailBefore = await request(createApp()).get(`/v1/courses/${course.id}`).set(authHeader(learner));
    const chapter2Before = detailBefore.body.chapters.find((c: any) => c.id === chapter2.id);
    expect(chapter2Before.isLocked).toBe(true);
    expect(chapter2Before.lessons[0].contentBody).toBeNull(); // ロック中は本文も隠す

    const lockedProgressRes = await request(createApp())
      .put(`/v1/courses/${course.id}/lessons/${lesson2.id}/progress`)
      .set(authHeader(learner))
      .send({ completed: true });
    expect(lockedProgressRes.status).toBe(403);
    expect(lockedProgressRes.body.error.code).toBe("chapter_locked");

    // 第1章のレッスンを完了し、小テストに合格する
    await request(createApp())
      .put(`/v1/courses/${course.id}/lessons/${lesson1.id}/progress`)
      .set(authHeader(learner))
      .send({ completed: true });
    const attemptRes = await request(createApp())
      .post(`/v1/courses/${course.id}/chapters/${chapter1.id}/quiz/attempts`)
      .set(authHeader(learner))
      .send({ answers: [{ questionId: question.id, choiceIds: [correctChoiceId] }] });
    expect(attemptRes.body.attempt.isPassed).toBe(true);

    // 第2章がアンロックされる
    const detailAfter = await request(createApp()).get(`/v1/courses/${course.id}`).set(authHeader(learner));
    const chapter2After = detailAfter.body.chapters.find((c: any) => c.id === chapter2.id);
    expect(chapter2After.isLocked).toBe(false);

    const unlockedProgressRes = await request(createApp())
      .put(`/v1/courses/${course.id}/lessons/${lesson2.id}/progress`)
      .set(authHeader(learner))
      .send({ completed: true });
    expect(unlockedProgressRes.status).toBe(200);
  });

  it("does not lock admins, regardless of chapter quiz pass state", async () => {
    const { admin, course, chapter2 } = await setupTwoChapterCourse();
    const detail = await request(createApp()).get(`/v1/courses/${course.id}`).set(authHeader(admin));
    const chapter2ForAdmin = detail.body.chapters.find((c: any) => c.id === chapter2.id);
    expect(chapter2ForAdmin.isLocked).toBe(false);
  });
});

describe("コース修了条件の拡張(全章テスト合格 + コース修了テスト)", () => {
  it("requires every chapter quiz to be passed, in addition to the final quiz, when has_final_quiz is true", async () => {
    const admin = makeUser({ role: "admin" });
    const course = makeCourseRow({ has_final_quiz: true, pass_score: 70 });
    const chapter1 = makeChapter(course.id, { display_order: 0 });
    const lesson1 = makeLesson(chapter1.id);

    const chapterQuizRes = await request(createApp())
      .post(`/v1/courses/${course.id}/chapters/${chapter1.id}/quiz`)
      .set(authHeader(admin))
      .send(quizPayload("第1章の小テスト"));
    const chapterQuestion = chapterQuizRes.body.questions[0];
    const chapterCorrectId = chapterQuestion.choices.find((c: any) => c.isCorrect).id;

    const finalQuizRes = await request(createApp())
      .post(`/v1/courses/${course.id}/quiz`)
      .set(authHeader(admin))
      .send(quizPayload("修了テスト"));
    const finalQuestion = finalQuizRes.body.questions[0];
    const finalCorrectId = finalQuestion.choices.find((c: any) => c.isCorrect).id;

    const learner = makeUser({});
    enroll(learner, course);

    await request(createApp())
      .put(`/v1/courses/${course.id}/lessons/${lesson1.id}/progress`)
      .set(authHeader(learner))
      .send({ completed: true });

    // 章テストのみ合格。修了テスト未受験のためまだ未完了
    const chapterAttemptRes = await request(createApp())
      .post(`/v1/courses/${course.id}/chapters/${chapter1.id}/quiz/attempts`)
      .set(authHeader(learner))
      .send({ answers: [{ questionId: chapterQuestion.id, choiceIds: [chapterCorrectId] }] });
    expect(chapterAttemptRes.body.enrollment.status).toBe("in_progress");

    // 修了テストにも合格して初めてコース修了
    const finalAttemptRes = await request(createApp())
      .post(`/v1/courses/${course.id}/quiz/attempts`)
      .set(authHeader(learner))
      .send({ answers: [{ questionId: finalQuestion.id, choiceIds: [finalCorrectId] }] });
    expect(finalAttemptRes.body.enrollment.status).toBe("completed");
  });

  it("does not require the final quiz when has_final_quiz is false, even if one exists", async () => {
    const admin = makeUser({ role: "admin" });
    const course = makeCourseRow({ has_final_quiz: false, pass_score: 70 });
    const chapter1 = makeChapter(course.id, { display_order: 0 });
    const lesson1 = makeLesson(chapter1.id);

    // コース修了テストを作成しておいても、has_final_quiz=falseなら完了条件から除外される
    await request(createApp()).post(`/v1/courses/${course.id}/quiz`).set(authHeader(admin)).send(quizPayload("修了テスト"));

    const learner = makeUser({});
    enroll(learner, course);

    const progressRes = await request(createApp())
      .put(`/v1/courses/${course.id}/lessons/${lesson1.id}/progress`)
      .set(authHeader(learner))
      .send({ completed: true });
    expect(progressRes.body.enrollment.status).toBe("completed");
  });
});
