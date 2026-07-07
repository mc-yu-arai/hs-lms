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
    department: "営業部",
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
    title: "グループテストコース",
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

beforeEach(() => {
  for (const t of ["users", "courses", "enrollments", "groups", "group_members", "group_courses", "notification_logs"]) {
    fakeDb.store.set(t, []);
  }
  (global as any).fetch = jest.fn(async () => ({ ok: true, text: async () => "", json: async () => ({}) }));
});

describe("access control", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(createApp()).get("/v1/groups");
    expect(res.status).toBe(401);
  });

  it("forbids learners", async () => {
    const learner = makeUser({ role: "learner" });
    const res = await request(createApp()).get("/v1/groups").set(authHeader(learner));
    expect(res.status).toBe(403);
  });
});

describe("GET/POST /v1/groups", () => {
  it("creates a group and lists it with member/course counts", async () => {
    const admin = makeUser({ role: "admin" });

    const createRes = await request(createApp())
      .post("/v1/groups")
      .set(authHeader(admin))
      .send({ name: "営業チーム", description: "営業部門の受講グループ" });
    expect(createRes.status).toBe(201);
    expect(createRes.body.group).toMatchObject({ name: "営業チーム", description: "営業部門の受講グループ" });

    const listRes = await request(createApp()).get("/v1/groups").set(authHeader(admin));
    expect(listRes.status).toBe(200);
    expect(listRes.body.groups).toHaveLength(1);
    expect(listRes.body.groups[0]).toMatchObject({ name: "営業チーム", memberCount: 0, courseCount: 0 });
  });
});

describe("GET/PUT/DELETE /v1/groups/:id", () => {
  it("returns 404 for a nonexistent group", async () => {
    const admin = makeUser({ role: "admin" });
    const res = await request(createApp()).get("/v1/groups/nonexistent").set(authHeader(admin));
    expect(res.status).toBe(404);
  });

  it("updates a group's name", async () => {
    const admin = makeUser({ role: "admin" });
    const createRes = await request(createApp()).post("/v1/groups").set(authHeader(admin)).send({ name: "旧名称" });
    const groupId = createRes.body.group.id;

    const putRes = await request(createApp()).put(`/v1/groups/${groupId}`).set(authHeader(admin)).send({ name: "新名称" });
    expect(putRes.status).toBe(200);
    expect(putRes.body.group.name).toBe("新名称");
  });

  it("deletes a group", async () => {
    const admin = makeUser({ role: "admin" });
    const createRes = await request(createApp()).post("/v1/groups").set(authHeader(admin)).send({ name: "削除対象" });
    const groupId = createRes.body.group.id;

    const deleteRes = await request(createApp()).delete(`/v1/groups/${groupId}`).set(authHeader(admin));
    expect(deleteRes.status).toBe(200);

    const getRes = await request(createApp()).get(`/v1/groups/${groupId}`).set(authHeader(admin));
    expect(getRes.status).toBe(404);
  });
});

describe("POST/DELETE /v1/groups/:id/members", () => {
  it("adds a member and is idempotent on re-add", async () => {
    const admin = makeUser({ role: "admin" });
    const learner = makeUser({ role: "learner" });
    const createRes = await request(createApp()).post("/v1/groups").set(authHeader(admin)).send({ name: "グループA" });
    const groupId = createRes.body.group.id;

    const addRes = await request(createApp())
      .post(`/v1/groups/${groupId}/members`)
      .set(authHeader(admin))
      .send({ userId: learner.id });
    expect(addRes.status).toBe(201);

    const secondAddRes = await request(createApp())
      .post(`/v1/groups/${groupId}/members`)
      .set(authHeader(admin))
      .send({ userId: learner.id });
    expect(secondAddRes.status).toBe(201);
    expect(fakeDb.store.get("group_members")).toHaveLength(1);

    const detailRes = await request(createApp()).get(`/v1/groups/${groupId}`).set(authHeader(admin));
    expect(detailRes.body.members).toHaveLength(1);
    expect(detailRes.body.members[0].user).toMatchObject({ lastName: "山田", firstName: "太郎" });
  });

  it("auto-enrolls a newly added member into courses already assigned to the group", async () => {
    const admin = makeUser({ role: "admin" });
    const learner = makeUser({ role: "learner" });
    const course = makeCourseRow({});
    const createRes = await request(createApp()).post("/v1/groups").set(authHeader(admin)).send({ name: "グループB" });
    const groupId = createRes.body.group.id;

    await request(createApp()).post(`/v1/groups/${groupId}/courses`).set(authHeader(admin)).send({ courseId: course.id });
    await request(createApp()).post(`/v1/groups/${groupId}/members`).set(authHeader(admin)).send({ userId: learner.id });

    const enrollments = fakeDb.store.get("enrollments")!;
    expect(enrollments).toHaveLength(1);
    expect(enrollments[0]).toMatchObject({ user_id: learner.id, course_id: course.id });
  });

  it("removing a member from the group does not delete their enrollment", async () => {
    const admin = makeUser({ role: "admin" });
    const learner = makeUser({ role: "learner" });
    const course = makeCourseRow({});
    const createRes = await request(createApp()).post("/v1/groups").set(authHeader(admin)).send({ name: "グループC" });
    const groupId = createRes.body.group.id;

    await request(createApp()).post(`/v1/groups/${groupId}/courses`).set(authHeader(admin)).send({ courseId: course.id });
    await request(createApp()).post(`/v1/groups/${groupId}/members`).set(authHeader(admin)).send({ userId: learner.id });
    expect(fakeDb.store.get("enrollments")).toHaveLength(1);

    const removeRes = await request(createApp())
      .delete(`/v1/groups/${groupId}/members`)
      .set(authHeader(admin))
      .send({ userId: learner.id });
    expect(removeRes.status).toBe(200);

    expect(fakeDb.store.get("group_members")).toHaveLength(0);
    expect(fakeDb.store.get("enrollments")).toHaveLength(1);
  });
});

describe("POST/DELETE /v1/groups/:id/courses", () => {
  it("assigns a course and auto-enrolls all current members, skipping those already enrolled", async () => {
    const admin = makeUser({ role: "admin" });
    const learnerA = makeUser({ role: "learner" });
    const learnerB = makeUser({ role: "learner" });
    const course = makeCourseRow({});
    const createRes = await request(createApp()).post("/v1/groups").set(authHeader(admin)).send({ name: "グループD" });
    const groupId = createRes.body.group.id;

    await request(createApp()).post(`/v1/groups/${groupId}/members`).set(authHeader(admin)).send({ userId: learnerA.id });
    await request(createApp()).post(`/v1/groups/${groupId}/members`).set(authHeader(admin)).send({ userId: learnerB.id });

    // learnerAは事前に自己受講登録済み(重複作成されないことを確認)
    await request(createApp()).post(`/v1/courses/${course.id}/enroll`).set(authHeader(learnerA));

    const assignRes = await request(createApp())
      .post(`/v1/groups/${groupId}/courses`)
      .set(authHeader(admin))
      .send({ courseId: course.id });
    expect(assignRes.status).toBe(201);

    const enrollments = fakeDb.store.get("enrollments")!.filter((e: any) => e.course_id === course.id);
    expect(enrollments).toHaveLength(2);
    expect(new Set(enrollments.map((e: any) => e.user_id))).toEqual(new Set([learnerA.id, learnerB.id]));
  });

  it("unassigning a course does not delete existing enrollments", async () => {
    const admin = makeUser({ role: "admin" });
    const learner = makeUser({ role: "learner" });
    const course = makeCourseRow({});
    const createRes = await request(createApp()).post("/v1/groups").set(authHeader(admin)).send({ name: "グループE" });
    const groupId = createRes.body.group.id;

    await request(createApp()).post(`/v1/groups/${groupId}/members`).set(authHeader(admin)).send({ userId: learner.id });
    await request(createApp()).post(`/v1/groups/${groupId}/courses`).set(authHeader(admin)).send({ courseId: course.id });
    expect(fakeDb.store.get("enrollments")).toHaveLength(1);

    const removeRes = await request(createApp())
      .delete(`/v1/groups/${groupId}/courses`)
      .set(authHeader(admin))
      .send({ courseId: course.id });
    expect(removeRes.status).toBe(200);

    expect(fakeDb.store.get("group_courses")).toHaveLength(0);
    expect(fakeDb.store.get("enrollments")).toHaveLength(1);
  });
});

describe("GET /v1/reports/groups/:id", () => {
  it("aggregates member progress within the group", async () => {
    const admin = makeUser({ role: "admin" });
    const learnerA = makeUser({ role: "learner", last_name: "鈴木", first_name: "花子" });
    const learnerB = makeUser({ role: "learner", last_name: "田中", first_name: "一郎" });
    const course = makeCourseRow({});
    const createRes = await request(createApp()).post("/v1/groups").set(authHeader(admin)).send({ name: "グループF" });
    const groupId = createRes.body.group.id;

    await request(createApp()).post(`/v1/groups/${groupId}/members`).set(authHeader(admin)).send({ userId: learnerA.id });
    await request(createApp()).post(`/v1/groups/${groupId}/members`).set(authHeader(admin)).send({ userId: learnerB.id });
    await request(createApp()).post(`/v1/groups/${groupId}/courses`).set(authHeader(admin)).send({ courseId: course.id });

    const enrollments = fakeDb.store.get("enrollments")!;
    const learnerAEnrollment = enrollments.find((e: any) => e.user_id === learnerA.id)!;
    learnerAEnrollment.status = "completed";
    learnerAEnrollment.progress_rate = 100;
    const learnerBEnrollment = enrollments.find((e: any) => e.user_id === learnerB.id)!;
    learnerBEnrollment.progress_rate = 0;

    const res = await request(createApp()).get(`/v1/reports/groups/${groupId}`).set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.report.memberCount).toBe(2);
    const memberA = res.body.report.members.find((m: any) => m.userId === learnerA.id);
    const memberB = res.body.report.members.find((m: any) => m.userId === learnerB.id);
    expect(memberA).toMatchObject({ courseCount: 1, completedCount: 1, averageProgressRate: 100 });
    expect(memberB).toMatchObject({ courseCount: 1, completedCount: 0, averageProgressRate: 0 });
    expect(res.body.report.averageCompletionRate).toBe(50);
  });

  it("returns 404 for a nonexistent group", async () => {
    const admin = makeUser({ role: "admin" });
    const res = await request(createApp()).get("/v1/reports/groups/nonexistent").set(authHeader(admin));
    expect(res.status).toBe(404);
  });

  it("returns a BOM-prefixed CSV", async () => {
    const admin = makeUser({ role: "admin" });
    const learner = makeUser({ role: "learner" });
    const createRes = await request(createApp()).post("/v1/groups").set(authHeader(admin)).send({ name: "グループG" });
    const groupId = createRes.body.group.id;
    await request(createApp()).post(`/v1/groups/${groupId}/members`).set(authHeader(admin)).send({ userId: learner.id });

    const res = await request(createApp()).get(`/v1/reports/groups/${groupId}/csv`).set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    expect(res.text).toContain("氏名");
  });
});
