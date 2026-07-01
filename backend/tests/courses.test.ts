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

beforeEach(() => {
  for (const t of ["users", "categories", "courses", "chapters", "lessons", "enrollments", "lesson_progress"]) {
    fakeDb.store.set(t, []);
  }
});

describe("GET /v1/courses", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(createApp()).get("/v1/courses");
    expect(res.status).toBe(401);
  });

  it("hides unpublished courses from learners but shows them to admins", async () => {
    makeCourseRow({ title: "公開コース", is_published: true });
    makeCourseRow({ title: "下書きコース", is_published: false });

    const learner = makeUser({ role: "learner" });
    const learnerRes = await request(createApp()).get("/v1/courses").set(authHeader(learner));
    expect(learnerRes.status).toBe(200);
    expect(learnerRes.body.courses).toHaveLength(1);
    expect(learnerRes.body.courses[0].title).toBe("公開コース");

    const admin = makeUser({ role: "admin" });
    const adminRes = await request(createApp()).get("/v1/courses").set(authHeader(admin));
    expect(adminRes.body.courses).toHaveLength(2);
  });
});

describe("GET /v1/courses/:id", () => {
  it("returns 404 for an unpublished course requested by a learner", async () => {
    const course = makeCourseRow({ is_published: false });
    const learner = makeUser({});
    const res = await request(createApp()).get(`/v1/courses/${course.id}`).set(authHeader(learner));
    expect(res.status).toBe(404);
  });

  it("hides lesson content for learners who have not enrolled, and reveals it once enrolled", async () => {
    const course = makeCourseRow({});
    const chapter = { id: "chapter-1", course_id: course.id, title: "第1章", display_order: 0 };
    fakeDb.store.get("chapters")!.push(chapter);
    fakeDb.store.get("lessons")!.push({
      id: "lesson-1",
      chapter_id: chapter.id,
      title: "レッスン1",
      content_type: "video",
      content_url: "https://example.com/video.mp4",
      content_body: null,
      duration_seconds: 300,
      display_order: 0,
    });

    const learner = makeUser({});
    const beforeRes = await request(createApp()).get(`/v1/courses/${course.id}`).set(authHeader(learner));
    expect(beforeRes.status).toBe(200);
    expect(beforeRes.body.enrolled).toBe(false);
    expect(beforeRes.body.chapters[0].lessons[0].contentUrl).toBeNull();

    fakeDb.store.get("enrollments")!.push({
      id: "enr-1",
      user_id: learner.id,
      course_id: course.id,
      status: "in_progress",
      progress_rate: 0,
      total_study_time: 0,
      started_at: new Date().toISOString(),
      completed_at: null,
      due_date: null,
    });

    const afterRes = await request(createApp()).get(`/v1/courses/${course.id}`).set(authHeader(learner));
    expect(afterRes.body.enrolled).toBe(true);
    expect(afterRes.body.chapters[0].lessons[0].contentUrl).toBe("https://example.com/video.mp4");
  });
});

describe("POST /v1/courses", () => {
  it("forbids non-admin roles", async () => {
    const learner = makeUser({ role: "learner" });
    const res = await request(createApp()).post("/v1/courses").set(authHeader(learner)).send({ title: "x", level: "beginner" });
    expect(res.status).toBe(403);
  });

  it("creates a course with nested chapters and lessons", async () => {
    const admin = makeUser({ role: "admin" });
    const res = await request(createApp())
      .post("/v1/courses")
      .set(authHeader(admin))
      .send({
        title: "新人研修",
        level: "beginner",
        chapters: [
          {
            title: "第1章 オリエンテーション",
            lessons: [
              { title: "動画を見る", contentType: "video", contentUrl: "https://example.com/v.mp4", durationSeconds: 600 },
              { title: "資料を読む", contentType: "pdf", contentUrl: "https://example.com/d.pdf" },
            ],
          },
        ],
      });

    expect(res.status).toBe(201);
    const courseId = res.body.course.id;
    expect(fakeDb.store.get("chapters")).toHaveLength(1);
    expect(fakeDb.store.get("lessons")).toHaveLength(2);
    expect(fakeDb.store.get("chapters")![0].course_id).toBe(courseId);
  });
});

describe("PUT /v1/courses/:id", () => {
  it("replaces the curriculum when chapters are provided", async () => {
    const admin = makeUser({ role: "admin" });
    const course = makeCourseRow({});
    fakeDb.store.get("chapters")!.push({ id: "old-chapter", course_id: course.id, title: "旧章", display_order: 0 });

    const res = await request(createApp())
      .put(`/v1/courses/${course.id}`)
      .set(authHeader(admin))
      .send({ title: "更新後タイトル", chapters: [{ title: "新章", lessons: [] }] });

    expect(res.status).toBe(200);
    expect(res.body.course.title).toBe("更新後タイトル");
    const chapters = fakeDb.store.get("chapters")!;
    expect(chapters).toHaveLength(1);
    expect(chapters[0].title).toBe("新章");
  });
});

describe("DELETE /v1/courses/:id", () => {
  it("refuses to delete a course that has enrollments", async () => {
    const admin = makeUser({ role: "admin" });
    const course = makeCourseRow({});
    fakeDb.store.get("enrollments")!.push({ id: "enr-x", user_id: "someone", course_id: course.id, status: "in_progress" });

    const res = await request(createApp()).delete(`/v1/courses/${course.id}`).set(authHeader(admin));
    expect(res.status).toBe(409);
    expect(fakeDb.store.get("courses")!.some((c: any) => c.id === course.id)).toBe(true);
  });

  it("deletes a course with no enrollments", async () => {
    const admin = makeUser({ role: "admin" });
    const course = makeCourseRow({});

    const res = await request(createApp()).delete(`/v1/courses/${course.id}`).set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(fakeDb.store.get("courses")!.some((c: any) => c.id === course.id)).toBe(false);
  });
});

describe("POST /v1/courses/:id/enroll", () => {
  it("enrolls a learner and is idempotent on repeated calls", async () => {
    const learner = makeUser({});
    const course = makeCourseRow({});

    const first = await request(createApp()).post(`/v1/courses/${course.id}/enroll`).set(authHeader(learner));
    expect(first.status).toBe(201);

    const second = await request(createApp()).post(`/v1/courses/${course.id}/enroll`).set(authHeader(learner));
    expect(second.status).toBe(200);
    expect(fakeDb.store.get("enrollments")).toHaveLength(1);
  });

  it("blocks enrollment when the prerequisite course has not been completed", async () => {
    const learner = makeUser({});
    const prerequisite = makeCourseRow({});
    const course = makeCourseRow({ prerequisite_course_id: prerequisite.id });

    const res = await request(createApp()).post(`/v1/courses/${course.id}/enroll`).set(authHeader(learner));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("prerequisite_not_completed");
  });

  it("allows enrollment once the prerequisite course is completed", async () => {
    const learner = makeUser({});
    const prerequisite = makeCourseRow({});
    const course = makeCourseRow({ prerequisite_course_id: prerequisite.id });
    fakeDb.store.get("enrollments")!.push({
      id: "enr-prereq",
      user_id: learner.id,
      course_id: prerequisite.id,
      status: "completed",
    });

    const res = await request(createApp()).post(`/v1/courses/${course.id}/enroll`).set(authHeader(learner));
    expect(res.status).toBe(201);
  });
});

describe("PUT /v1/courses/:id/lessons/:lessonId/progress", () => {
  it("marks the lesson complete and rolls the enrollment up to completed once every lesson is done", async () => {
    const learner = makeUser({});
    const course = makeCourseRow({});
    const chapter = { id: "chapter-1", course_id: course.id, title: "第1章", display_order: 0 };
    fakeDb.store.get("chapters")!.push(chapter);
    fakeDb.store.get("lessons")!.push({
      id: "lesson-1",
      chapter_id: chapter.id,
      title: "動画レッスン",
      content_type: "video",
      content_url: "https://example.com/v.mp4",
      content_body: null,
      duration_seconds: 100,
      display_order: 0,
    });
    fakeDb.store.get("enrollments")!.push({
      id: "enr-1",
      user_id: learner.id,
      course_id: course.id,
      status: "in_progress",
      progress_rate: 0,
      total_study_time: 0,
      started_at: new Date().toISOString(),
      completed_at: null,
      due_date: null,
    });

    const res = await request(createApp())
      .put(`/v1/courses/${course.id}/lessons/lesson-1/progress`)
      .set(authHeader(learner))
      .send({ progressPercent: 85, studyTimeDeltaSeconds: 100 });

    expect(res.status).toBe(200);
    expect(res.body.enrollment.status).toBe("completed");
    expect(res.body.enrollment.progressRate).toBe(100);
    expect(res.body.enrollment.totalStudyTime).toBe(100);
  });

  it("returns 404 when not enrolled in the course", async () => {
    const learner = makeUser({});
    const course = makeCourseRow({});
    const chapter = { id: "chapter-1", course_id: course.id, title: "第1章", display_order: 0 };
    fakeDb.store.get("chapters")!.push(chapter);
    fakeDb.store.get("lessons")!.push({
      id: "lesson-1",
      chapter_id: chapter.id,
      title: "動画レッスン",
      content_type: "video",
      content_url: null,
      content_body: null,
      duration_seconds: 100,
      display_order: 0,
    });

    const res = await request(createApp())
      .put(`/v1/courses/${course.id}/lessons/lesson-1/progress`)
      .set(authHeader(learner))
      .send({ progressPercent: 50 });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_enrolled");
  });
});
