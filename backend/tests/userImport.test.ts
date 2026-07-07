import request from "supertest";

jest.mock("../src/lib/supabase", () => {
  const { createFakeDb } = require("./helpers/fakeSupabase");
  const fakeDb = createFakeDb();
  const authUsers = new Map<string, { id: string; email: string }>();
  let counter = 0;

  const createUserMock = jest.fn(async ({ email }: { email: string; password: string; email_confirm: boolean }) => {
    if (email === "authfail@example.com") {
      return { data: { user: null }, error: { message: "simulated auth failure" } };
    }
    const id = `auth-${++counter}`;
    authUsers.set(id, { id, email });
    return { data: { user: { id, email } }, error: null };
  });

  const deleteUserMock = jest.fn(async (id: string) => {
    authUsers.delete(id);
    return { error: null };
  });

  return {
    __fakeDb: fakeDb,
    __authUsers: authUsers,
    __createUserMock: createUserMock,
    __deleteUserMock: deleteUserMock,
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
          createUser: (...args: unknown[]) => createUserMock(...(args as [any])),
          deleteUser: (...args: unknown[]) => deleteUserMock(...(args as [any])),
        },
      },
    },
    supabaseAuth: { auth: { signInWithPassword: jest.fn() } },
  };
});

import { createApp } from "../src/app";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const supabaseModule = require("../src/lib/supabase");
const fakeDb = supabaseModule.__fakeDb as ReturnType<typeof import("./helpers/fakeSupabase").createFakeDb>;
const createUserMock = supabaseModule.__createUserMock as jest.Mock;
const deleteUserMock = supabaseModule.__deleteUserMock as jest.Mock;

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
    hire_date: null,
    ...overrides,
  };
  fakeDb.store.get("users")!.push(user);
  return user;
}

function authHeader(user: { id: string }) {
  return { Authorization: `Bearer access-${user.id}` };
}

function makeGroup(overrides: Partial<Record<string, unknown>> = {}) {
  const group = {
    id: (overrides.id as string) ?? `group-${Math.random().toString(36).slice(2, 8)}`,
    name: "営業チーム",
    description: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
  fakeDb.store.get("groups")!.push(group);
  return group;
}

function makeCourseRow(overrides: Partial<Record<string, unknown>> = {}) {
  const course = {
    id: (overrides.id as string) ?? `course-${Math.random().toString(36).slice(2, 8)}`,
    title: "テストコース",
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
  for (const t of ["users", "groups", "group_members", "group_courses", "courses", "enrollments", "notification_logs"]) {
    fakeDb.store.set(t, []);
  }
  createUserMock.mockClear();
  deleteUserMock.mockClear();
  (global as any).fetch = jest.fn(async () => ({ ok: true, text: async () => "", json: async () => ({}) }));
});

describe("POST /v1/users", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(createApp()).post("/v1/users").send({});
    expect(res.status).toBe(401);
  });

  it("forbids learners", async () => {
    const learner = makeUser({ role: "learner" });
    const res = await request(createApp()).post("/v1/users").set(authHeader(learner)).send({});
    expect(res.status).toBe(403);
  });

  it("creates a user, sends a welcome email, and returns the public profile", async () => {
    const admin = makeUser({ role: "admin" });

    const res = await request(createApp())
      .post("/v1/users")
      .set(authHeader(admin))
      .send({ lastName: "鈴木", firstName: "花子", email: "suzuki@example.com", role: "learner", department: "営業部" });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ lastName: "鈴木", firstName: "花子", email: "suzuki@example.com", role: "learner" });
    expect(createUserMock).toHaveBeenCalledWith(expect.objectContaining({ email: "suzuki@example.com", email_confirm: true }));
    expect(global.fetch).toHaveBeenCalled();
    expect(fakeDb.store.get("users")).toHaveLength(2);
  });

  it("rejects a duplicate email", async () => {
    const admin = makeUser({ role: "admin" });
    makeUser({ email: "dup@example.com" });

    const res = await request(createApp())
      .post("/v1/users")
      .set(authHeader(admin))
      .send({ lastName: "鈴木", firstName: "花子", email: "dup@example.com", role: "learner" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("email_already_exists");
  });

  it("rejects an invalid hireDate", async () => {
    const admin = makeUser({ role: "admin" });
    const res = await request(createApp())
      .post("/v1/users")
      .set(authHeader(admin))
      .send({ lastName: "鈴木", firstName: "花子", email: "suzuki@example.com", role: "learner", hireDate: "not-a-date" });
    expect(res.status).toBe(400);
  });

  it("rejects a nonexistent groupId and creates no user", async () => {
    const admin = makeUser({ role: "admin" });
    const res = await request(createApp())
      .post("/v1/users")
      .set(authHeader(admin))
      .send({ lastName: "鈴木", firstName: "花子", email: "suzuki@example.com", role: "learner", groupIds: ["nonexistent"] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("group_not_found");
    expect(fakeDb.store.get("users")).toHaveLength(1);
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it("assigns the new user to the specified group and syncs enrollments for already-assigned courses", async () => {
    const admin = makeUser({ role: "admin" });
    const group = makeGroup({});
    const course = makeCourseRow({});
    fakeDb.store.get("group_courses")!.push({ id: "gc-1", group_id: group.id, course_id: course.id, assigned_at: new Date().toISOString() });

    const res = await request(createApp())
      .post("/v1/users")
      .set(authHeader(admin))
      .send({ lastName: "鈴木", firstName: "花子", email: "suzuki@example.com", role: "learner", groupIds: [group.id] });

    expect(res.status).toBe(201);
    expect(fakeDb.store.get("group_members")).toHaveLength(1);
    const enrollments = fakeDb.store.get("enrollments")!;
    expect(enrollments).toHaveLength(1);
    expect(enrollments[0]).toMatchObject({ user_id: res.body.user.id, course_id: course.id });
  });
});

describe("GET /v1/users/import/template", () => {
  it("returns a BOM-prefixed CSV template with the expected headers", async () => {
    const admin = makeUser({ role: "admin" });
    const res = await request(createApp()).get("/v1/users/import/template").set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    expect(res.text).toContain("姓,名,メールアドレス,ロール,部署,入社日,グループ");
  });
});

describe("POST /v1/users/import", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(createApp()).post("/v1/users/import");
    expect(res.status).toBe(401);
  });

  it("requires a file", async () => {
    const admin = makeUser({ role: "admin" });
    const res = await request(createApp()).post("/v1/users/import").set(authHeader(admin));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("file_required");
  });

  it("rejects the whole file when any row is invalid, creating nothing", async () => {
    const admin = makeUser({ role: "admin" });
    const csv = [
      "姓,名,メールアドレス,ロール,部署,入社日,グループ",
      "鈴木,花子,suzuki@example.com,learner,営業部,2024-04-01,存在しないグループ",
      "田中,一郎,not-an-email,invalid_role,人事部,bad-date,",
    ].join("\n");

    const res = await request(createApp())
      .post("/v1/users/import")
      .set(authHeader(admin))
      .attach("file", Buffer.from(csv, "utf-8"), "users.csv");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("csv_validation_error");
    const messages = res.body.error.rowErrors.map((e: any) => e.message).join(" / ");
    expect(messages).toContain("メールアドレスの形式が不正です");
    expect(messages).toContain("ロールの値が不正です");
    expect(messages).toContain("入社日の形式が不正です");
    expect(messages).toContain("存在しないグループです");
    expect(res.body.error.rowErrors.find((e: any) => e.message.includes("存在しないグループ")).row).toBe(1);
    expect(createUserMock).not.toHaveBeenCalled();
    expect(fakeDb.store.get("users")).toHaveLength(1);
  });

  it("rejects a CSV email that duplicates an existing user", async () => {
    const admin = makeUser({ role: "admin" });
    makeUser({ email: "existing@example.com" });
    const csv = ["姓,名,メールアドレス,ロール,部署,入社日,グループ", "鈴木,花子,existing@example.com,learner,,,"].join("\n");

    const res = await request(createApp())
      .post("/v1/users/import")
      .set(authHeader(admin))
      .attach("file", Buffer.from(csv, "utf-8"), "users.csv");

    expect(res.status).toBe(400);
    expect(res.body.error.rowErrors[0].message).toContain("既に登録されているメールアドレス");
  });

  it("imports valid rows and assigns group membership", async () => {
    const admin = makeUser({ role: "admin" });
    const group = makeGroup({ name: "営業チーム" });
    const csv = [
      "姓,名,メールアドレス,ロール,部署,入社日,グループ",
      "鈴木,花子,suzuki@example.com,learner,営業部,2024-04-01,営業チーム",
      "田中,一郎,tanaka@example.com,admin,人事部,,",
    ].join("\n");

    const res = await request(createApp())
      .post("/v1/users/import")
      .set(authHeader(admin))
      .attach("file", Buffer.from(csv, "utf-8"), "users.csv");

    expect(res.status).toBe(201);
    expect(res.body.count).toBe(2);
    expect(fakeDb.store.get("users")).toHaveLength(3);
    expect(fakeDb.store.get("group_members")).toHaveLength(1);

    const suzuki = res.body.users.find((u: any) => u.email === "suzuki@example.com");
    expect(suzuki).toMatchObject({ lastName: "鈴木", firstName: "花子", role: "learner", department: "営業部" });
  });

  it("rolls back already-created users when a later row fails during account creation", async () => {
    const admin = makeUser({ role: "admin" });
    const csv = [
      "姓,名,メールアドレス,ロール,部署,入社日,グループ",
      "鈴木,花子,suzuki@example.com,learner,,,",
      "田中,一郎,authfail@example.com,learner,,,",
    ].join("\n");

    const res = await request(createApp())
      .post("/v1/users/import")
      .set(authHeader(admin))
      .attach("file", Buffer.from(csv, "utf-8"), "users.csv");

    expect(res.status).toBe(500);
    expect(fakeDb.store.get("users")).toHaveLength(1);
    expect(deleteUserMock).toHaveBeenCalledTimes(1);
  });
});
