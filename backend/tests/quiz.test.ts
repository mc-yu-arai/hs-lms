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
    thumbnail_url: null,
    prerequisite_course_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
  fakeDb.store.get("courses")!.push(course);
  return course;
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

const quizPayload = {
  title: "コース修了テスト",
  questions: [
    {
      questionText: "Q1: 正しいものを1つ選んでください",
      questionType: "single_choice",
      choices: [
        { choiceText: "A(正)", isCorrect: true },
        { choiceText: "B", isCorrect: false },
      ],
    },
    {
      questionText: "Q2: 正しいものを全て選んでください",
      questionType: "multiple_choice",
      choices: [
        { choiceText: "A(正)", isCorrect: true },
        { choiceText: "B(正)", isCorrect: true },
        { choiceText: "C", isCorrect: false },
      ],
    },
  ],
};

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

describe("POST /v1/courses/:id/quiz", () => {
  it("forbids non-admin roles", async () => {
    const learner = makeUser({ role: "learner" });
    const course = makeCourseRow({});
    const res = await request(createApp()).post(`/v1/courses/${course.id}/quiz`).set(authHeader(learner)).send(quizPayload);
    expect(res.status).toBe(403);
  });

  it("rejects a single_choice question with more than one correct choice", async () => {
    const admin = makeUser({ role: "admin" });
    const course = makeCourseRow({});
    const res = await request(createApp())
      .post(`/v1/courses/${course.id}/quiz`)
      .set(authHeader(admin))
      .send({
        title: "不正なテスト",
        questions: [
          {
            questionText: "Q1",
            questionType: "single_choice",
            choices: [
              { choiceText: "A", isCorrect: true },
              { choiceText: "B", isCorrect: true },
            ],
          },
        ],
      });
    expect(res.status).toBe(400);
  });

  it("creates a quiz with nested questions and choices", async () => {
    const admin = makeUser({ role: "admin" });
    const course = makeCourseRow({});
    const res = await request(createApp()).post(`/v1/courses/${course.id}/quiz`).set(authHeader(admin)).send(quizPayload);

    expect(res.status).toBe(200);
    expect(res.body.questions).toHaveLength(2);
    expect(res.body.questions[0].choices.some((c: any) => c.isCorrect === true)).toBe(true);
    expect(fakeDb.store.get("quizzes")).toHaveLength(1);
    expect(fakeDb.store.get("questions")).toHaveLength(2);
    expect(fakeDb.store.get("choices")).toHaveLength(5);
  });
});

describe("GET /v1/courses/:id/quiz", () => {
  it("returns 404 when the course has no quiz", async () => {
    const learner = makeUser({});
    const course = makeCourseRow({});
    const res = await request(createApp()).get(`/v1/courses/${course.id}/quiz`).set(authHeader(learner));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("quiz_not_found");
  });

  it("requires enrollment for learners, but not for admins", async () => {
    const admin = makeUser({ role: "admin" });
    const course = makeCourseRow({});
    await request(createApp()).post(`/v1/courses/${course.id}/quiz`).set(authHeader(admin)).send(quizPayload);

    const learner = makeUser({});
    const notEnrolledRes = await request(createApp()).get(`/v1/courses/${course.id}/quiz`).set(authHeader(learner));
    expect(notEnrolledRes.status).toBe(404);
    expect(notEnrolledRes.body.error.code).toBe("not_enrolled");

    const adminRes = await request(createApp()).get(`/v1/courses/${course.id}/quiz`).set(authHeader(admin));
    expect(adminRes.status).toBe(200);
  });

  it("hides isCorrect from learners but shows it to admins", async () => {
    const admin = makeUser({ role: "admin" });
    const course = makeCourseRow({});
    await request(createApp()).post(`/v1/courses/${course.id}/quiz`).set(authHeader(admin)).send(quizPayload);

    const learner = makeUser({});
    enroll(learner, course);

    const learnerRes = await request(createApp()).get(`/v1/courses/${course.id}/quiz`).set(authHeader(learner));
    expect(learnerRes.status).toBe(200);
    expect(learnerRes.body.questions[0].choices[0].isCorrect).toBeUndefined();

    const adminRes = await request(createApp()).get(`/v1/courses/${course.id}/quiz`).set(authHeader(admin));
    expect(adminRes.body.questions[0].choices[0].isCorrect).toBeDefined();
  });
});

describe("POST /v1/courses/:id/quiz/attempts", () => {
  it("scores single_choice and multiple_choice questions and marks pass/fail based on course pass_score", async () => {
    const admin = makeUser({ role: "admin" });
    const course = makeCourseRow({ pass_score: 70 });
    const createRes = await request(createApp()).post(`/v1/courses/${course.id}/quiz`).set(authHeader(admin)).send(quizPayload);
    const [q1, q2] = createRes.body.questions;
    const q1Correct = q1.choices.find((c: any) => c.isCorrect).id;
    const q1Wrong = q1.choices.find((c: any) => !c.isCorrect).id;
    const q2CorrectIds = q2.choices.filter((c: any) => c.isCorrect).map((c: any) => c.id);

    const learner = makeUser({});
    enroll(learner, course);

    const passRes = await request(createApp())
      .post(`/v1/courses/${course.id}/quiz/attempts`)
      .set(authHeader(learner))
      .send({
        answers: [
          { questionId: q1.id, choiceIds: [q1Correct] },
          { questionId: q2.id, choiceIds: q2CorrectIds },
        ],
      });
    expect(passRes.status).toBe(201);
    expect(passRes.body.attempt.score).toBe(100);
    expect(passRes.body.attempt.isPassed).toBe(true);
    expect(passRes.body.questionResults.every((r: any) => r.isCorrect)).toBe(true);

    // 再受験は無制限。今度はどちらも不正解にして0点にする
    const failRes = await request(createApp())
      .post(`/v1/courses/${course.id}/quiz/attempts`)
      .set(authHeader(learner))
      .send({
        answers: [
          { questionId: q1.id, choiceIds: [q1Wrong] },
          { questionId: q2.id, choiceIds: [q2CorrectIds[0]] }, // 片方だけ選択(過不足あり)は不正解扱い
        ],
      });
    expect(failRes.status).toBe(201);
    expect(failRes.body.attempt.score).toBe(0);
    expect(failRes.body.attempt.isPassed).toBe(false);

    const historyRes = await request(createApp()).get(`/v1/courses/${course.id}/quiz/attempts`).set(authHeader(learner));
    expect(historyRes.body.attempts).toHaveLength(2);
    const historyById = new Map(historyRes.body.attempts.map((a: any) => [a.id, a]));
    expect(historyById.get(passRes.body.attempt.id)).toMatchObject({ score: 100, isPassed: true });
    expect(historyById.get(failRes.body.attempt.id)).toMatchObject({ score: 0, isPassed: false });
  });

  it("requires both all lessons completed and a passing quiz attempt for course completion", async () => {
    const admin = makeUser({ role: "admin" });
    const course = makeCourseRow({ pass_score: 70 });
    const chapter = { id: "chapter-1", course_id: course.id, title: "第1章", display_order: 0 };
    fakeDb.store.get("chapters")!.push(chapter);
    fakeDb.store.get("lessons")!.push({
      id: "lesson-1",
      chapter_id: chapter.id,
      title: "レッスン1",
      content_type: "text",
      content_url: null,
      content_body: "本文",
      duration_seconds: null,
      display_order: 0,
    });

    const createRes = await request(createApp()).post(`/v1/courses/${course.id}/quiz`).set(authHeader(admin)).send(quizPayload);
    const [q1, q2] = createRes.body.questions;
    const q1Correct = q1.choices.find((c: any) => c.isCorrect).id;
    const q2CorrectIds = q2.choices.filter((c: any) => c.isCorrect).map((c: any) => c.id);

    const learner = makeUser({});
    enroll(learner, course);

    const lessonRes = await request(createApp())
      .put(`/v1/courses/${course.id}/lessons/lesson-1/progress`)
      .set(authHeader(learner))
      .send({ completed: true });
    expect(lessonRes.status).toBe(200);
    expect(lessonRes.body.enrollment.status).toBe("in_progress"); // 全レッスン完了だがテスト未合格

    const attemptRes = await request(createApp())
      .post(`/v1/courses/${course.id}/quiz/attempts`)
      .set(authHeader(learner))
      .send({
        answers: [
          { questionId: q1.id, choiceIds: [q1Correct] },
          { questionId: q2.id, choiceIds: q2CorrectIds },
        ],
      });
    expect(attemptRes.body.attempt.isPassed).toBe(true);
    expect(attemptRes.body.enrollment.status).toBe("completed");
  });
});
