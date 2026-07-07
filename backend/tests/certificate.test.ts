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
    title: "修了証テストコース",
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

function makeEnrollment(user: { id: string }, course: { id: string }, status = "completed") {
  const enrollment = {
    id: `enr-${Math.random().toString(36).slice(2, 8)}`,
    user_id: user.id,
    course_id: course.id,
    status,
    progress_rate: status === "completed" ? 100 : 50,
    total_study_time: 0,
    started_at: new Date().toISOString(),
    completed_at: status === "completed" ? new Date().toISOString() : null,
    due_date: null,
  };
  fakeDb.store.get("enrollments")!.push(enrollment);
  return enrollment;
}

beforeEach(() => {
  for (const t of ["users", "courses", "enrollments", "certificates"]) {
    fakeDb.store.set(t, []);
  }
});

describe("POST /v1/courses/:id/certificate", () => {
  it("rejects unauthenticated requests", async () => {
    const course = makeCourseRow({});
    const res = await request(createApp()).post(`/v1/courses/${course.id}/certificate`);
    expect(res.status).toBe(401);
  });

  it("returns 409 when the course is not completed", async () => {
    const learner = makeUser({});
    const course = makeCourseRow({});
    makeEnrollment(learner, course, "in_progress");

    const res = await request(createApp()).post(`/v1/courses/${course.id}/certificate`).set(authHeader(learner));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("course_not_completed");
  });

  it("returns 409 when there is no enrollment at all", async () => {
    const learner = makeUser({});
    const course = makeCourseRow({});

    const res = await request(createApp()).post(`/v1/courses/${course.id}/certificate`).set(authHeader(learner));
    expect(res.status).toBe(409);
  });

  it("issues a certificate for a completed course and is idempotent on repeat calls", async () => {
    const learner = makeUser({});
    const course = makeCourseRow({});
    makeEnrollment(learner, course, "completed");

    const first = await request(createApp()).post(`/v1/courses/${course.id}/certificate`).set(authHeader(learner));
    expect(first.status).toBe(201);
    expect(first.body.certificate.verificationUuid).toBeDefined();

    const second = await request(createApp()).post(`/v1/courses/${course.id}/certificate`).set(authHeader(learner));
    expect(second.status).toBe(200);
    expect(second.body.certificate.id).toBe(first.body.certificate.id);
    expect(second.body.certificate.verificationUuid).toBe(first.body.certificate.verificationUuid);
    expect(fakeDb.store.get("certificates")).toHaveLength(1);
  });
});

describe("GET /v1/courses/:id/certificate/download", () => {
  it("returns 409 when the course is not completed", async () => {
    const learner = makeUser({});
    const course = makeCourseRow({});
    const res = await request(createApp()).get(`/v1/courses/${course.id}/certificate/download`).set(authHeader(learner));
    expect(res.status).toBe(409);
  });

  it("streams a PDF for a completed course", async () => {
    const learner = makeUser({});
    const course = makeCourseRow({});
    makeEnrollment(learner, course, "completed");

    const res = await request(createApp()).get(`/v1/courses/${course.id}/certificate/download`).set(authHeader(learner));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.body.slice(0, 4).toString("ascii")).toBe("%PDF");
  });
});

describe("GET /v1/certificates/:uuid/verify", () => {
  it("returns 404 for an unknown uuid", async () => {
    const res = await request(createApp()).get("/v1/certificates/00000000-0000-0000-0000-000000000000/verify");
    expect(res.status).toBe(404);
    expect(res.body.valid).toBe(false);
  });

  it("returns course/learner info for a valid uuid without requiring auth", async () => {
    const learner = makeUser({ last_name: "鈴木", first_name: "花子" });
    const course = makeCourseRow({ title: "検証対象コース" });
    makeEnrollment(learner, course, "completed");

    const issueRes = await request(createApp()).post(`/v1/courses/${course.id}/certificate`).set(authHeader(learner));
    const uuid = issueRes.body.certificate.verificationUuid;

    const res = await request(createApp()).get(`/v1/certificates/${uuid}/verify`);
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.certificate.courseTitle).toBe("検証対象コース");
    expect(res.body.certificate.learnerName).toBe("鈴木 花子");
  });
});
