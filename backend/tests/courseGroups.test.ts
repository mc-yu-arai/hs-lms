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
  const group = {
    id,
    name: "テストグループ",
    description: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
  fakeDb.store.get("groups")!.push(group);
  return group;
}

function assignGroupCourse(group: { id: string }, course: { id: string }) {
  fakeDb.store
    .get("group_courses")!
    .push({ id: `gc-${Math.random().toString(36).slice(2, 8)}`, group_id: group.id, course_id: course.id, assigned_at: new Date().toISOString() });
}

beforeEach(() => {
  for (const t of ["users", "courses", "groups", "group_members", "group_courses"]) {
    fakeDb.store.set(t, []);
  }
});

describe("GET /v1/courses/:id/groups", () => {
  it("forbids non-admin roles", async () => {
    const learner = makeUser({ role: "learner" });
    const course = makeCourseRow({});
    const res = await request(createApp()).get(`/v1/courses/${course.id}/groups`).set(authHeader(learner));
    expect(res.status).toBe(403);
  });

  it("returns 404 for a non-existent course", async () => {
    const admin = makeUser({ role: "admin" });
    const res = await request(createApp()).get("/v1/courses/does-not-exist/groups").set(authHeader(admin));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("course_not_found");
  });

  it("returns an empty list when the course has no group assigned", async () => {
    const admin = makeUser({ role: "admin" });
    const course = makeCourseRow({});
    const res = await request(createApp()).get(`/v1/courses/${course.id}/groups`).set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.groups).toEqual([]);
  });

  it("lists the groups assigned to the course", async () => {
    const admin = makeUser({ role: "admin" });
    const course = makeCourseRow({});
    const groupA = makeGroup({ name: "グループA" });
    const groupB = makeGroup({ name: "グループB" });
    assignGroupCourse(groupA, course);
    assignGroupCourse(groupB, course);

    const res = await request(createApp()).get(`/v1/courses/${course.id}/groups`).set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.groups).toHaveLength(2);
    expect(res.body.groups.map((g: any) => g.group.name).sort()).toEqual(["グループA", "グループB"]);
  });
});

describe("POST/DELETE /v1/groups/:id/courses (コース編集画面からの再利用)", () => {
  it("assigning and then unassigning a course updates the course-side groups list", async () => {
    const admin = makeUser({ role: "admin" });
    const course = makeCourseRow({});
    const group = makeGroup({ name: "コース編集画面用グループ" });

    const assignRes = await request(createApp())
      .post(`/v1/groups/${group.id}/courses`)
      .set(authHeader(admin))
      .send({ courseId: course.id });
    expect(assignRes.status).toBe(201);

    const afterAssign = await request(createApp()).get(`/v1/courses/${course.id}/groups`).set(authHeader(admin));
    expect(afterAssign.body.groups).toHaveLength(1);
    expect(afterAssign.body.groups[0].group.name).toBe("コース編集画面用グループ");

    const removeRes = await request(createApp())
      .delete(`/v1/groups/${group.id}/courses`)
      .set(authHeader(admin))
      .send({ courseId: course.id });
    expect(removeRes.status).toBe(200);

    const afterRemove = await request(createApp()).get(`/v1/courses/${course.id}/groups`).set(authHeader(admin));
    expect(afterRemove.body.groups).toEqual([]);
  });
});
