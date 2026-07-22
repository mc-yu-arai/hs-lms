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
        admin: {
          signOut: jest.fn(async () => ({ error: null })),
          updateUserById: jest.fn(async (userId: string, attrs: { email?: string }) => {
            if (attrs.email === "auth-error@example.com") {
              return { data: null, error: { message: "Auth側の更新に失敗しました" } };
            }
            return { data: { user: { id: userId, email: attrs.email } }, error: null };
          }),
        },
      },
      storage: {
        from: () => ({
          list: jest.fn(async () => ({ data: [], error: null })),
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
    last_login_at: null,
    totp_enabled: false,
    totp_secret: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
  fakeDb.store.get("users")!.push(user);
  return user;
}

function authHeader(user: { id: string }) {
  return { Authorization: `Bearer access-${user.id}` };
}

beforeEach(() => {
  fakeDb.store.set("users", []);
  supabaseModule.supabaseAdmin.auth.admin.updateUserById.mockClear();
});

describe("GET /v1/users", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(createApp()).get("/v1/users");
    expect(res.status).toBe(401);
  });

  it("forbids learners", async () => {
    const learner = makeUser({ role: "learner" });
    const res = await request(createApp()).get("/v1/users").set(authHeader(learner));
    expect(res.status).toBe(403);
  });

  it("allows admins to list all users and filter by role", async () => {
    const admin = makeUser({ role: "admin" });
    makeUser({ role: "learner" });
    makeUser({ role: "learner" });

    const allRes = await request(createApp()).get("/v1/users").set(authHeader(admin));
    expect(allRes.status).toBe(200);
    expect(allRes.body.users).toHaveLength(3);

    const filteredRes = await request(createApp()).get("/v1/users?role=learner").set(authHeader(admin));
    expect(filteredRes.body.users).toHaveLength(2);
    expect(filteredRes.body.users.every((u: any) => u.role === "learner")).toBe(true);
  });
});

describe("PUT /v1/users/:id", () => {
  it("forbids learners", async () => {
    const learner = makeUser({ role: "learner" });
    const target = makeUser({ role: "learner" });
    const res = await request(createApp()).put(`/v1/users/${target.id}`).set(authHeader(learner)).send({ role: "admin" });
    expect(res.status).toBe(403);
  });

  it("rejects self-modification to prevent lockout", async () => {
    const admin = makeUser({ role: "admin" });
    const res = await request(createApp()).put(`/v1/users/${admin.id}`).set(authHeader(admin)).send({ isActive: false });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("self_modification_forbidden");
  });

  it("returns 404 for a non-existent user", async () => {
    const admin = makeUser({ role: "admin" });
    const res = await request(createApp()).put("/v1/users/does-not-exist").set(authHeader(admin)).send({ role: "admin" });
    expect(res.status).toBe(404);
  });

  it("allows an admin to change another user's role and active status", async () => {
    const admin = makeUser({ role: "admin" });
    const target = makeUser({ role: "learner", is_active: true });

    const res = await request(createApp())
      .put(`/v1/users/${target.id}`)
      .set(authHeader(admin))
      .send({ role: "admin", isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("admin");
    expect(res.body.user.isActive).toBe(false);
    expect(fakeDb.store.get("users")!.find((u: any) => u.id === target.id)!.role).toBe("admin");
  });

  it("allows an admin to change another user's name, department and hire date", async () => {
    const admin = makeUser({ role: "admin" });
    const target = makeUser({ role: "learner", last_name: "山田", first_name: "太郎", department: null, hire_date: null });

    const res = await request(createApp())
      .put(`/v1/users/${target.id}`)
      .set(authHeader(admin))
      .send({ lastName: "鈴木", firstName: "次郎", department: "営業部", hireDate: "2020-04-01" });

    expect(res.status).toBe(200);
    expect(res.body.user.lastName).toBe("鈴木");
    expect(res.body.user.firstName).toBe("次郎");
    expect(res.body.user.department).toBe("営業部");
    expect(res.body.user.hireDate).toBe("2020-04-01");
  });

  it("rejects an invalid hire date format", async () => {
    const admin = makeUser({ role: "admin" });
    const target = makeUser({ role: "learner" });

    const res = await request(createApp())
      .put(`/v1/users/${target.id}`)
      .set(authHeader(admin))
      .send({ hireDate: "2020/04/01" });

    expect(res.status).toBe(400);
  });

  it("updates the email address and syncs Supabase Auth when changed", async () => {
    const admin = makeUser({ role: "admin" });
    const target = makeUser({ role: "learner", email: "old@example.com" });

    const res = await request(createApp())
      .put(`/v1/users/${target.id}`)
      .set(authHeader(admin))
      .send({ email: "new@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("new@example.com");
    expect(fakeDb.store.get("users")!.find((u: any) => u.id === target.id)!.email).toBe("new@example.com");
    expect(supabaseModule.supabaseAdmin.auth.admin.updateUserById).toHaveBeenCalledWith(
      target.id,
      expect.objectContaining({ email: "new@example.com" }),
    );
  });

  it("rejects when the new email is already used by another user", async () => {
    const admin = makeUser({ role: "admin" });
    const target = makeUser({ role: "learner", email: "target@example.com" });
    makeUser({ role: "learner", email: "taken@example.com" });

    const res = await request(createApp())
      .put(`/v1/users/${target.id}`)
      .set(authHeader(admin))
      .send({ email: "taken@example.com" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("email_already_exists");
  });

  it("returns an error when Supabase Auth email update fails, without touching public.users", async () => {
    const admin = makeUser({ role: "admin" });
    const target = makeUser({ role: "learner", email: "old2@example.com" });

    const res = await request(createApp())
      .put(`/v1/users/${target.id}`)
      .set(authHeader(admin))
      .send({ email: "auth-error@example.com" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("email_update_failed");
    expect(fakeDb.store.get("users")!.find((u: any) => u.id === target.id)!.email).toBe("old2@example.com");
  });

  it("does not call Supabase Auth when the email is unchanged", async () => {
    const admin = makeUser({ role: "admin" });
    const target = makeUser({ role: "learner", email: "same@example.com" });

    const res = await request(createApp())
      .put(`/v1/users/${target.id}`)
      .set(authHeader(admin))
      .send({ email: "same@example.com", department: "総務部" });

    expect(res.status).toBe(200);
    expect(supabaseModule.supabaseAdmin.auth.admin.updateUserById).not.toHaveBeenCalled();
  });
});
