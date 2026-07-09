import request from "supertest";

jest.mock("../src/lib/supabase", () => {
  const { createFakeDb } = require("./helpers/fakeSupabase");
  const fakeDb = createFakeDb();

  const deleteUserMock = jest.fn(async (_id: string) => ({ error: null }));
  const removeMock = jest.fn(async (_paths: string[]) => ({ data: [], error: null }));

  return {
    __fakeDb: fakeDb,
    __deleteUserMock: deleteUserMock,
    __removeMock: removeMock,
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
        admin: {
          signOut: jest.fn(async () => ({ error: null })),
          deleteUser: (...args: unknown[]) => deleteUserMock(...(args as [any])),
        },
      },
      storage: {
        from: () => ({
          list: jest.fn(async () => ({ data: [], error: null })),
          remove: (...args: unknown[]) => removeMock(...(args as [any])),
        }),
      },
    },
    supabaseAuth: { auth: { signInWithPassword: jest.fn() } },
  };
});

import { createApp } from "../src/app";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const supabaseModule = require("../src/lib/supabase");
const fakeDb = supabaseModule.__fakeDb as ReturnType<typeof import("./helpers/fakeSupabase").createFakeDb>;
const deleteUserMock = supabaseModule.__deleteUserMock as jest.Mock;
const removeMock = supabaseModule.__removeMock as jest.Mock;

function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
  const id = (overrides.id as string) ?? `user-${Math.random().toString(36).slice(2, 8)}`;
  const user = {
    id,
    email: `${id}@example.com`,
    role: "learner",
    is_active: true,
    last_name: "山田",
    first_name: "太郎",
    ...overrides,
  };
  fakeDb.store.get("users")!.push(user);
  return user;
}

function authHeader(user: { id: string }) {
  return { Authorization: `Bearer access-${user.id}` };
}

function makeCourseRow(overrides: Partial<Record<string, unknown>> = {}) {
  const course = {
    id: (overrides.id as string) ?? `course-${Math.random().toString(36).slice(2, 8)}`,
    title: "削除テストコース",
    is_published: true,
    level: "beginner",
    ...overrides,
  };
  fakeDb.store.get("courses")!.push(course);
  return course;
}

beforeEach(() => {
  for (const t of ["users", "courses", "enrollments", "certificates", "notification_logs", "groups", "group_members"]) {
    fakeDb.store.set(t, []);
  }
  deleteUserMock.mockClear();
  removeMock.mockClear();
});

describe("DELETE /v1/users/:id", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(createApp()).delete("/v1/users/someone");
    expect(res.status).toBe(401);
  });

  it("forbids learners", async () => {
    const learner = makeUser({ role: "learner" });
    const target = makeUser({});
    const res = await request(createApp()).delete(`/v1/users/${target.id}`).set(authHeader(learner));
    expect(res.status).toBe(403);
  });

  it("forbids deleting oneself", async () => {
    const admin = makeUser({ role: "admin" });
    const res = await request(createApp()).delete(`/v1/users/${admin.id}`).set(authHeader(admin));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("self_modification_forbidden");
  });

  it("returns 404 for a nonexistent user", async () => {
    const admin = makeUser({ role: "admin" });
    const res = await request(createApp()).delete("/v1/users/nonexistent").set(authHeader(admin));
    expect(res.status).toBe(404);
  });

  it("deletes the Auth account, the user row, and all dependent data", async () => {
    const admin = makeUser({ role: "admin" });
    const target = makeUser({});
    const course = makeCourseRow({});
    const group = { id: "group-1", name: "テストグループ", description: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    fakeDb.store.get("groups")!.push(group);

    fakeDb.store.get("enrollments")!.push({ id: "enr-1", user_id: target.id, course_id: course.id, status: "completed", progress_rate: 100 });
    fakeDb.store.get("certificates")!.push({ id: "cert-1", user_id: target.id, course_id: course.id, verification_uuid: "uuid-1" });
    fakeDb.store.get("notification_logs")!.push({ id: "log-1", user_id: target.id, course_id: course.id, notification_type: "enrollment_completed", is_success: true });
    fakeDb.store.get("group_members")!.push({ id: "gm-1", group_id: group.id, user_id: target.id, added_at: new Date().toISOString() });

    // 削除対象と無関係の他ユーザーのデータは影響を受けないことも確認する
    const otherUser = makeUser({});
    fakeDb.store.get("enrollments")!.push({ id: "enr-2", user_id: otherUser.id, course_id: course.id, status: "in_progress", progress_rate: 0 });

    const res = await request(createApp()).delete(`/v1/users/${target.id}`).set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(deleteUserMock).toHaveBeenCalledWith(target.id);
    expect(removeMock).toHaveBeenCalled();

    expect(fakeDb.store.get("users")!.find((u: any) => u.id === target.id)).toBeUndefined();
    expect(fakeDb.store.get("enrollments")!.filter((e: any) => e.user_id === target.id)).toHaveLength(0);
    expect(fakeDb.store.get("certificates")!.filter((c: any) => c.user_id === target.id)).toHaveLength(0);
    expect(fakeDb.store.get("notification_logs")!.filter((l: any) => l.user_id === target.id)).toHaveLength(0);

    // 他ユーザーの受講登録は残っている
    expect(fakeDb.store.get("enrollments")!.filter((e: any) => e.user_id === otherUser.id)).toHaveLength(1);
    expect(fakeDb.store.get("users")!.find((u: any) => u.id === otherUser.id)).toBeDefined();
  });
});
