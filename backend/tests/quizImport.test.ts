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

const HEADER = "問題文,問題種別,選択肢1,選択肢2,選択肢3,選択肢4,正解";

function csvRow(fields: string[]): string {
  return fields
    .map((f) => (/[",\r\n]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f))
    .join(",");
}

const validCsv = [
  HEADER,
  csvRow(["Q1: 正しいものを1つ選んでください", "single", "A(正)", "B", "", "", "1"]),
  csvRow(["Q2: 正しいものを全て選んでください", "multiple", "A(正)", "B(正)", "C", "", "1,2"]),
].join("\r\n");

beforeEach(() => {
  for (const t of ["users", "categories", "courses", "chapters", "lessons", "enrollments", "quizzes", "questions", "choices"]) {
    fakeDb.store.set(t, []);
  }
});

describe("GET /v1/courses/:id/quiz/import/template", () => {
  it("returns a BOM-prefixed CSV template with the expected headers", async () => {
    const admin = makeUser({ role: "admin" });
    const course = makeCourseRow({});
    const res = await request(createApp()).get(`/v1/courses/${course.id}/quiz/import/template`).set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    expect(res.text).toContain(HEADER);
  });

  it("forbids non-admin roles", async () => {
    const learner = makeUser({ role: "learner" });
    const course = makeCourseRow({});
    const res = await request(createApp()).get(`/v1/courses/${course.id}/quiz/import/template`).set(authHeader(learner));
    expect(res.status).toBe(403);
  });
});

describe("POST /v1/courses/:id/quiz/import", () => {
  it("forbids non-admin roles", async () => {
    const learner = makeUser({ role: "learner" });
    const course = makeCourseRow({});
    const res = await request(createApp())
      .post(`/v1/courses/${course.id}/quiz/import?mode=append`)
      .set(authHeader(learner))
      .attach("file", Buffer.from(validCsv, "utf-8"), "quiz.csv");
    expect(res.status).toBe(403);
  });

  it("requires a file", async () => {
    const admin = makeUser({ role: "admin" });
    const course = makeCourseRow({});
    const res = await request(createApp()).post(`/v1/courses/${course.id}/quiz/import?mode=append`).set(authHeader(admin));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("file_required");
  });

  it("requires a valid mode query param", async () => {
    const admin = makeUser({ role: "admin" });
    const course = makeCourseRow({});
    const res = await request(createApp())
      .post(`/v1/courses/${course.id}/quiz/import`)
      .set(authHeader(admin))
      .attach("file", Buffer.from(validCsv, "utf-8"), "quiz.csv");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_mode");
  });

  it("auto-creates a quiz with a default title when the course has none yet", async () => {
    const admin = makeUser({ role: "admin" });
    const course = makeCourseRow({});
    const res = await request(createApp())
      .post(`/v1/courses/${course.id}/quiz/import?mode=append`)
      .set(authHeader(admin))
      .attach("file", Buffer.from(validCsv, "utf-8"), "quiz.csv");

    expect(res.status).toBe(201);
    expect(res.body.quiz.title).toBe("修了確認テスト");
    expect(res.body.importedCount).toBe(2);
    expect(res.body.questions).toHaveLength(2);
    expect(res.body.questions[1].questionType).toBe("multiple_choice");
    expect(res.body.questions[1].choices.filter((c: any) => c.isCorrect)).toHaveLength(2);
    expect(fakeDb.store.get("quizzes")).toHaveLength(1);
  });

  it("append mode adds rows after existing questions without touching them", async () => {
    const admin = makeUser({ role: "admin" });
    const course = makeCourseRow({});
    await request(createApp()).post(`/v1/courses/${course.id}/quiz`).set(authHeader(admin)).send({
      title: "既存テスト",
      questions: [
        { questionText: "既存Q1", questionType: "single_choice", choices: [{ choiceText: "A", isCorrect: true }, { choiceText: "B", isCorrect: false }] },
      ],
    });

    const res = await request(createApp())
      .post(`/v1/courses/${course.id}/quiz/import?mode=append`)
      .set(authHeader(admin))
      .attach("file", Buffer.from(validCsv, "utf-8"), "quiz.csv");

    expect(res.status).toBe(201);
    expect(res.body.quiz.title).toBe("既存テスト"); // タイトルは維持される
    expect(res.body.questions).toHaveLength(3);
    expect(res.body.questions[0].questionText).toBe("既存Q1");
    expect(res.body.questions[1].questionText).toContain("Q1:");
    expect(res.body.questions[2].questionText).toContain("Q2:");
  });

  it("replace mode discards existing questions and keeps only the CSV content", async () => {
    const admin = makeUser({ role: "admin" });
    const course = makeCourseRow({});
    await request(createApp()).post(`/v1/courses/${course.id}/quiz`).set(authHeader(admin)).send({
      title: "既存テスト",
      questions: [
        { questionText: "既存Q1", questionType: "single_choice", choices: [{ choiceText: "A", isCorrect: true }, { choiceText: "B", isCorrect: false }] },
      ],
    });

    const res = await request(createApp())
      .post(`/v1/courses/${course.id}/quiz/import?mode=replace`)
      .set(authHeader(admin))
      .attach("file", Buffer.from(validCsv, "utf-8"), "quiz.csv");

    expect(res.status).toBe(201);
    expect(res.body.quiz.title).toBe("既存テスト"); // タイトルは維持される(CSVは設問・選択肢のみ)
    expect(res.body.questions).toHaveLength(2);
    expect(res.body.questions.some((q: any) => q.questionText === "既存Q1")).toBe(false);
    expect(fakeDb.store.get("questions")).toHaveLength(2);
  });

  it("rolls back and reports row-level errors without creating anything when the CSV is invalid", async () => {
    const admin = makeUser({ role: "admin" });
    const course = makeCourseRow({});
    const invalidCsv = [
      HEADER,
      csvRow(["", "single", "A", "B", "", "", "1"]), // 問題文が空
      csvRow(["Q2", "unknown", "A", "B", "", "", "1"]), // 問題種別が不正
      csvRow(["Q3", "single", "A", "B", "", "", "5"]), // 正解が範囲外
      csvRow(["Q4", "multiple", "A", "B", "", "", "1,1"]), // 正解が重複
    ].join("\r\n");

    const res = await request(createApp())
      .post(`/v1/courses/${course.id}/quiz/import?mode=append`)
      .set(authHeader(admin))
      .attach("file", Buffer.from(invalidCsv, "utf-8"), "quiz.csv");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("csv_validation_error");
    expect(res.body.error.rowErrors.length).toBeGreaterThanOrEqual(4);
    expect(fakeDb.store.get("quizzes")).toHaveLength(0);
    expect(fakeDb.store.get("questions")).toHaveLength(0);
  });

  it("rejects a choice gap (choice3 filled after choice2 is skipped)", async () => {
    const admin = makeUser({ role: "admin" });
    const course = makeCourseRow({});
    const csv = [HEADER, csvRow(["Q1", "single", "A", "", "C", "", "1"])].join("\r\n");

    const res = await request(createApp())
      .post(`/v1/courses/${course.id}/quiz/import?mode=append`)
      .set(authHeader(admin))
      .attach("file", Buffer.from(csv, "utf-8"), "quiz.csv");

    expect(res.status).toBe(400);
    expect(res.body.error.rowErrors[0].message).toContain("詰めて入力");
  });
});
