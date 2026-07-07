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
    department: null,
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
    title: "レポート対象コース",
    is_published: true,
    is_mandatory: false,
    level: "beginner",
    created_at: new Date().toISOString(),
    ...overrides,
  };
  fakeDb.store.get("courses")!.push(course);
  return course;
}

function makeEnrollment(user: { id: string }, course: { id: string }, status: string, progressRate: number) {
  const enrollment = {
    id: `enr-${Math.random().toString(36).slice(2, 8)}`,
    user_id: user.id,
    course_id: course.id,
    status,
    progress_rate: progressRate,
  };
  fakeDb.store.get("enrollments")!.push(enrollment);
  return enrollment;
}

beforeEach(() => {
  for (const t of ["users", "courses", "enrollments"]) {
    fakeDb.store.set(t, []);
  }
});

describe("GET /v1/reports/users", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(createApp()).get("/v1/reports/users");
    expect(res.status).toBe(401);
  });

  it("forbids learners", async () => {
    const learner = makeUser({ role: "learner" });
    const res = await request(createApp()).get("/v1/reports/users").set(authHeader(learner));
    expect(res.status).toBe(403);
  });

  it("aggregates course count, completed count, and average progress per user", async () => {
    const admin = makeUser({ role: "admin", last_name: "管理", first_name: "太郎" });
    const learner = makeUser({ role: "learner", last_name: "鈴木", first_name: "花子", department: "営業部" });
    const idle = makeUser({ role: "learner", last_name: "田中", first_name: "次郎" });

    const courseA = makeCourseRow({});
    const courseB = makeCourseRow({});
    makeEnrollment(learner, courseA, "completed", 100);
    makeEnrollment(learner, courseB, "in_progress", 50);

    const res = await request(createApp()).get("/v1/reports/users").set(authHeader(admin));
    expect(res.status).toBe(200);

    const learnerRow = res.body.users.find((u: any) => u.userId === learner.id);
    expect(learnerRow).toMatchObject({ courseCount: 2, completedCount: 1, averageProgressRate: 75, department: "営業部" });

    const idleRow = res.body.users.find((u: any) => u.userId === idle.id);
    expect(idleRow).toMatchObject({ courseCount: 0, completedCount: 0, averageProgressRate: 0 });
  });
});

describe("GET /v1/reports/courses", () => {
  it("aggregates enrollment count, completion rate, and average progress per course", async () => {
    const admin = makeUser({ role: "admin" });
    const learner1 = makeUser({ role: "learner" });
    const learner2 = makeUser({ role: "learner" });

    const courseA = makeCourseRow({ title: "コースA" });
    const courseB = makeCourseRow({ title: "コースB" });
    makeEnrollment(learner1, courseA, "completed", 100);
    makeEnrollment(learner2, courseA, "in_progress", 40);
    // courseBは受講者なし

    const res = await request(createApp()).get("/v1/reports/courses").set(authHeader(admin));
    expect(res.status).toBe(200);

    const rowA = res.body.courses.find((c: any) => c.courseId === courseA.id);
    expect(rowA).toMatchObject({ enrolledCount: 2, completedCount: 1, completionRate: 50, averageProgressRate: 70 });

    const rowB = res.body.courses.find((c: any) => c.courseId === courseB.id);
    expect(rowB).toMatchObject({ enrolledCount: 0, completedCount: 0, completionRate: 0, averageProgressRate: 0 });
  });
});

describe("CSV endpoints", () => {
  it("returns a BOM-prefixed CSV for the user report", async () => {
    const admin = makeUser({ role: "admin" });
    const learner = makeUser({ role: "learner", last_name: "鈴木", first_name: "花子" });
    const course = makeCourseRow({});
    makeEnrollment(learner, course, "completed", 100);

    const res = await request(createApp()).get("/v1/reports/users/csv").set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    const text = res.text;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain("氏名,部署,受講コース数,修了数,平均進捗率(%)");
    expect(text).toContain("鈴木 花子");
  });

  it("returns a BOM-prefixed CSV for the course report", async () => {
    const admin = makeUser({ role: "admin" });
    makeCourseRow({ title: "CSV対象コース" });

    const res = await request(createApp()).get("/v1/reports/courses/csv").set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("コース名,受講者数,修了者数,修了率(%),平均進捗率(%)");
    expect(res.text).toContain("CSV対象コース");
  });

  it("forbids learners from downloading CSV reports", async () => {
    const learner = makeUser({ role: "learner" });
    const res = await request(createApp()).get("/v1/reports/users/csv").set(authHeader(learner));
    expect(res.status).toBe(403);
  });
});
