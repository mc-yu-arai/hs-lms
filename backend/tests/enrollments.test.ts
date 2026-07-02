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
    ...overrides,
  };
  fakeDb.store.get("courses")!.push(course);
  return course;
}

function makeEnrollmentRow(overrides: Partial<Record<string, unknown>> = {}) {
  const id = (overrides.id as string) ?? `enr-${Math.random().toString(36).slice(2, 8)}`;
  const enrollment = {
    id,
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

beforeEach(() => {
  for (const t of ["users", "categories", "courses", "chapters", "lessons", "enrollments", "lesson_progress"]) {
    fakeDb.store.set(t, []);
  }
});

describe("GET /v1/users/me/enrollments", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(createApp()).get("/v1/users/me/enrollments");
    expect(res.status).toBe(401);
  });

  it("returns an empty list when the user has no enrollments", async () => {
    const user = makeUser({});
    const res = await request(createApp()).get("/v1/users/me/enrollments").set(authHeader(user));
    expect(res.status).toBe(200);
    expect(res.body.enrollments).toEqual([]);
  });

  it("returns enrollments joined with their course info, scoped to the requesting user", async () => {
    const user = makeUser({});
    const otherUser = makeUser({});
    const course = makeCourseRow({ title: "新人研修", level: "beginner", duration_minutes: 90 });
    const otherCourse = makeCourseRow({ title: "他人のコース" });

    makeEnrollmentRow({ user_id: user.id, course_id: course.id, status: "in_progress", progress_rate: 42.5 });
    makeEnrollmentRow({ user_id: otherUser.id, course_id: otherCourse.id, status: "completed" });

    const res = await request(createApp()).get("/v1/users/me/enrollments").set(authHeader(user));

    expect(res.status).toBe(200);
    expect(res.body.enrollments).toHaveLength(1);
    expect(res.body.enrollments[0]).toMatchObject({
      status: "in_progress",
      progressRate: 42.5,
      course: { title: "新人研修", level: "beginner", durationMinutes: 90 },
    });
  });

  it("silently skips an enrollment whose course no longer exists", async () => {
    const user = makeUser({});
    makeEnrollmentRow({ user_id: user.id, course_id: "missing-course-id" });

    const res = await request(createApp()).get("/v1/users/me/enrollments").set(authHeader(user));

    expect(res.status).toBe(200);
    expect(res.body.enrollments).toEqual([]);
  });
});
