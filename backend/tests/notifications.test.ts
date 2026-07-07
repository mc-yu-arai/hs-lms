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
    title: "通知テストコース",
    is_published: true,
    is_mandatory: false,
    level: "beginner",
    prerequisite_course_id: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
  fakeDb.store.get("courses")!.push(course);
  return course;
}

function makeEnrollment(user: { id: string }, course: { id: string }, overrides: Partial<Record<string, unknown>> = {}) {
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
    ...overrides,
  };
  fakeDb.store.get("enrollments")!.push(enrollment);
  return enrollment;
}

function isoDateDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => {
  for (const t of ["users", "courses", "enrollments", "notification_settings", "notification_logs", "chapters", "lessons"]) {
    fakeDb.store.set(t, []);
  }
  (global as any).fetch = jest.fn(async () => ({ ok: true, text: async () => "", json: async () => ({}) }));
});

describe("GET/PUT /v1/admin/notification-settings", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(createApp()).get("/v1/admin/notification-settings");
    expect(res.status).toBe(401);
  });

  it("forbids learners", async () => {
    const learner = makeUser({ role: "learner" });
    const res = await request(createApp()).get("/v1/admin/notification-settings").set(authHeader(learner));
    expect(res.status).toBe(403);
  });

  it("auto-creates default settings on first access", async () => {
    const admin = makeUser({ role: "admin" });
    const res = await request(createApp()).get("/v1/admin/notification-settings").set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.settings).toMatchObject({ reminderDaysBefore: 7, autoSendTime: "09:00:00", isEnabled: true });
    expect(fakeDb.store.get("notification_settings")).toHaveLength(1);
  });

  it("updates settings and persists the change", async () => {
    const admin = makeUser({ role: "admin" });
    const putRes = await request(createApp())
      .put("/v1/admin/notification-settings")
      .set(authHeader(admin))
      .send({ reminderDaysBefore: 3, autoSendTime: "18:30", isEnabled: false });
    expect(putRes.status).toBe(200);
    expect(putRes.body.settings).toMatchObject({ reminderDaysBefore: 3, autoSendTime: "18:30", isEnabled: false });

    const getRes = await request(createApp()).get("/v1/admin/notification-settings").set(authHeader(admin));
    expect(getRes.body.settings).toMatchObject({ reminderDaysBefore: 3, autoSendTime: "18:30", isEnabled: false });
  });

  it("rejects an invalid autoSendTime format", async () => {
    const admin = makeUser({ role: "admin" });
    const res = await request(createApp()).put("/v1/admin/notification-settings").set(authHeader(admin)).send({ autoSendTime: "9am" });
    expect(res.status).toBe(400);
  });
});

describe("POST /v1/admin/notifications/send-reminders", () => {
  it("sends a reminder for an enrollment whose due date is within the reminder window", async () => {
    const admin = makeUser({ role: "admin" });
    const learner = makeUser({ role: "learner" });
    const course = makeCourseRow({});
    makeEnrollment(learner, course, { due_date: isoDateDaysFromNow(5) });

    const res = await request(createApp()).post("/v1/admin/notifications/send-reminders").set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({ sent: 1, skipped: 0, failed: 0 });
    expect(fakeDb.store.get("notification_logs")).toHaveLength(1);
    expect(fakeDb.store.get("notification_logs")![0]).toMatchObject({ notification_type: "due_date_reminder", is_success: true });
  });

  it("does not resend a reminder that was already sent successfully", async () => {
    const admin = makeUser({ role: "admin" });
    const learner = makeUser({ role: "learner" });
    const course = makeCourseRow({});
    makeEnrollment(learner, course, { due_date: isoDateDaysFromNow(5) });

    await request(createApp()).post("/v1/admin/notifications/send-reminders").set(authHeader(admin));
    const second = await request(createApp()).post("/v1/admin/notifications/send-reminders").set(authHeader(admin));

    expect(second.body.result).toMatchObject({ sent: 0, skipped: 1, failed: 0 });
    expect(fakeDb.store.get("notification_logs")).toHaveLength(1);
  });

  it("skips completed enrollments and enrollments outside the reminder window", async () => {
    const admin = makeUser({ role: "admin" });
    const learner = makeUser({ role: "learner" });
    const course = makeCourseRow({});
    makeEnrollment(learner, course, { due_date: isoDateDaysFromNow(5), status: "completed" });
    makeEnrollment(learner, makeCourseRow({}), { due_date: isoDateDaysFromNow(30) });

    const res = await request(createApp()).post("/v1/admin/notifications/send-reminders").set(authHeader(admin));
    expect(res.body.result).toMatchObject({ sent: 0, skipped: 0, failed: 0 });
    expect(fakeDb.store.get("notification_logs")).toHaveLength(0);
  });

  it("does nothing when notifications are disabled", async () => {
    const admin = makeUser({ role: "admin" });
    await request(createApp()).put("/v1/admin/notification-settings").set(authHeader(admin)).send({ isEnabled: false });

    const learner = makeUser({ role: "learner" });
    const course = makeCourseRow({});
    makeEnrollment(learner, course, { due_date: isoDateDaysFromNow(5) });

    const res = await request(createApp()).post("/v1/admin/notifications/send-reminders").set(authHeader(admin));
    expect(res.body.result).toMatchObject({ sent: 0, skipped: 0, failed: 0 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("records a failure when the email provider rejects the send", async () => {
    (global as any).fetch = jest.fn(async () => ({ ok: false, status: 500, text: async () => "boom" }));
    const admin = makeUser({ role: "admin" });
    const learner = makeUser({ role: "learner" });
    const course = makeCourseRow({});
    makeEnrollment(learner, course, { due_date: isoDateDaysFromNow(5) });

    const res = await request(createApp()).post("/v1/admin/notifications/send-reminders").set(authHeader(admin));
    expect(res.body.result).toMatchObject({ sent: 0, skipped: 0, failed: 1 });
    expect(fakeDb.store.get("notification_logs")![0]).toMatchObject({ is_success: false });
  });
});

describe("GET /v1/admin/notifications/logs", () => {
  it("returns enriched log entries with learner name and course title", async () => {
    const admin = makeUser({ role: "admin" });
    const learner = makeUser({ role: "learner", last_name: "鈴木", first_name: "花子" });
    const course = makeCourseRow({ title: "通知履歴コース" });
    makeEnrollment(learner, course, { due_date: isoDateDaysFromNow(1) });

    await request(createApp()).post("/v1/admin/notifications/send-reminders").set(authHeader(admin));
    const res = await request(createApp()).get("/v1/admin/notifications/logs").set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.logs[0]).toMatchObject({
      learnerName: "鈴木 花子",
      courseTitle: "通知履歴コース",
      notificationType: "due_date_reminder",
      isSuccess: true,
    });
  });
});

describe("event-triggered notifications", () => {
  it("logs an enrollment_completed notification when a learner enrolls", async () => {
    const learner = makeUser({ role: "learner" });
    const course = makeCourseRow({});

    const res = await request(createApp()).post(`/v1/courses/${course.id}/enroll`).set(authHeader(learner));
    expect(res.status).toBe(201);

    const logs = fakeDb.store.get("notification_logs")!;
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ notification_type: "enrollment_completed", user_id: learner.id, course_id: course.id, is_success: true });
  });

  it("logs a course_completed notification exactly once when the last lesson is completed", async () => {
    const learner = makeUser({ role: "learner" });
    const course = makeCourseRow({});
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
    makeEnrollment(learner, course, {});

    const res = await request(createApp())
      .put(`/v1/courses/${course.id}/lessons/lesson-1/progress`)
      .set(authHeader(learner))
      .send({ completed: true });
    expect(res.status).toBe(200);
    expect(res.body.enrollment.status).toBe("completed");

    const completionLogs = fakeDb.store.get("notification_logs")!.filter((l: any) => l.notification_type === "course_completed");
    expect(completionLogs).toHaveLength(1);

    // 既に完了済みの状態でもう一度更新をかけても再送されない
    await request(createApp())
      .put(`/v1/courses/${course.id}/lessons/lesson-1/progress`)
      .set(authHeader(learner))
      .send({ completed: true });
    const completionLogsAfter = fakeDb.store.get("notification_logs")!.filter((l: any) => l.notification_type === "course_completed");
    expect(completionLogsAfter).toHaveLength(1);
  });
});
