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
    thumbnail_url: null,
    prerequisite_course_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
  fakeDb.store.get("courses")!.push(course);
  return course;
}

function makeGroup(overrides: Partial<Record<string, unknown>> = {}) {
  const id = (overrides.id as string) ?? `group-${Math.random().toString(36).slice(2, 8)}`;
  const group = { id, name: "テストグループ", description: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...overrides };
  fakeDb.store.get("groups")!.push(group);
  return group;
}

function addGroupMember(group: { id: string }, user: { id: string }) {
  fakeDb.store.get("group_members")!.push({ id: `gm-${Math.random().toString(36).slice(2, 8)}`, group_id: group.id, user_id: user.id, added_at: new Date().toISOString() });
}

function assignGroupCourse(group: { id: string }, course: { id: string }) {
  fakeDb.store.get("group_courses")!.push({ id: `gc-${Math.random().toString(36).slice(2, 8)}`, group_id: group.id, course_id: course.id, assigned_at: new Date().toISOString() });
}

beforeEach(() => {
  for (const t of ["users", "courses", "chapters", "lessons", "enrollments", "groups", "group_members", "group_courses"]) {
    fakeDb.store.set(t, []);
  }
});

describe("GET /v1/courses (限定公開)", () => {
  it("hides a limited course from a learner who is not in an assigned group", async () => {
    makeCourseRow({ id: "c-open", title: "全体公開コース", is_limited: false });
    makeCourseRow({ id: "c-limited", title: "限定公開コース", is_limited: true });

    const learner = makeUser({ role: "learner" });
    const res = await request(createApp()).get("/v1/courses").set(authHeader(learner));

    expect(res.status).toBe(200);
    const titles = res.body.courses.map((c: any) => c.title);
    expect(titles).toContain("全体公開コース");
    expect(titles).not.toContain("限定公開コース");
  });

  it("shows the limited course to a learner whose group is assigned to it", async () => {
    const course = makeCourseRow({ id: "c-limited", title: "限定公開コース", is_limited: true });
    const group = makeGroup({});
    const learner = makeUser({ role: "learner" });
    addGroupMember(group, learner);
    assignGroupCourse(group, course);

    const res = await request(createApp()).get("/v1/courses").set(authHeader(learner));
    expect(res.status).toBe(200);
    expect(res.body.courses.map((c: any) => c.title)).toContain("限定公開コース");
  });

  it("shows all limited courses to admins regardless of group membership", async () => {
    makeCourseRow({ id: "c-limited", title: "限定公開コース", is_limited: true });
    const admin = makeUser({ role: "admin" });

    const res = await request(createApp()).get("/v1/courses").set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.courses.map((c: any) => c.title)).toContain("限定公開コース");
  });
});

describe("GET /v1/courses/:id (限定公開)", () => {
  it("returns 404 for a learner not in an assigned group", async () => {
    const course = makeCourseRow({ is_limited: true });
    const learner = makeUser({ role: "learner" });

    const res = await request(createApp()).get(`/v1/courses/${course.id}`).set(authHeader(learner));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("course_not_found");
  });

  it("returns 200 for a learner whose group is assigned to it", async () => {
    const course = makeCourseRow({ is_limited: true });
    const group = makeGroup({});
    const learner = makeUser({ role: "learner" });
    addGroupMember(group, learner);
    assignGroupCourse(group, course);

    const res = await request(createApp()).get(`/v1/courses/${course.id}`).set(authHeader(learner));
    expect(res.status).toBe(200);
  });

  it("returns 200 for admins regardless of group membership", async () => {
    const course = makeCourseRow({ is_limited: true });
    const admin = makeUser({ role: "admin" });

    const res = await request(createApp()).get(`/v1/courses/${course.id}`).set(authHeader(admin));
    expect(res.status).toBe(200);
  });
});

describe("POST /v1/courses/:id/enroll (限定公開)", () => {
  it("rejects enrollment from a learner not in an assigned group", async () => {
    const course = makeCourseRow({ is_limited: true });
    const learner = makeUser({ role: "learner" });

    const res = await request(createApp()).post(`/v1/courses/${course.id}/enroll`).set(authHeader(learner));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("course_not_found");
    expect(fakeDb.store.get("enrollments")).toHaveLength(0);
  });

  it("allows enrollment from a learner whose group is assigned to it", async () => {
    const course = makeCourseRow({ is_limited: true });
    const group = makeGroup({});
    const learner = makeUser({ role: "learner" });
    addGroupMember(group, learner);
    assignGroupCourse(group, course);

    const res = await request(createApp()).post(`/v1/courses/${course.id}/enroll`).set(authHeader(learner));
    expect(res.status).toBe(201);
  });

  it("allows admins to enroll regardless of group membership", async () => {
    const course = makeCourseRow({ is_limited: true });
    const admin = makeUser({ role: "admin" });

    const res = await request(createApp()).post(`/v1/courses/${course.id}/enroll`).set(authHeader(admin));
    expect(res.status).toBe(201);
  });
});

describe("PUT /v1/courses/:id (限定公開トグル)", () => {
  it("admin can toggle isLimited on and off", async () => {
    const course = makeCourseRow({ is_limited: false });
    const admin = makeUser({ role: "admin" });

    const onRes = await request(createApp()).put(`/v1/courses/${course.id}`).set(authHeader(admin)).send({ isLimited: true });
    expect(onRes.status).toBe(200);
    expect(onRes.body.course.isLimited).toBe(true);

    const offRes = await request(createApp()).put(`/v1/courses/${course.id}`).set(authHeader(admin)).send({ isLimited: false });
    expect(offRes.status).toBe(200);
    expect(offRes.body.course.isLimited).toBe(false);
  });
});
