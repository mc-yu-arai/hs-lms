import request from "supertest";

type MockUser = {
  id: string;
  email: string;
  last_name: string;
  first_name: string;
  role: "learner" | "admin" | "super_admin";
  department: string | null;
  hire_date: string | null;
  is_active: boolean;
  last_login_at: string | null;
  totp_secret: string | null;
  totp_enabled: boolean;
  failed_login_count: number;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
};

const usersById = new Map<string, MockUser>();

function makeUser(overrides: Partial<MockUser>): MockUser {
  const id = overrides.id ?? "00000000-0000-0000-0000-000000000001";
  const user: MockUser = {
    id,
    email: "learner@example.com",
    last_name: "山田",
    first_name: "太郎",
    role: "learner",
    department: null,
    hire_date: null,
    is_active: true,
    last_login_at: null,
    totp_secret: null,
    totp_enabled: false,
    failed_login_count: 0,
    locked_until: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
  usersById.set(id, user);
  return user;
}

// signInWithPasswordの成否をテストごとに切り替えるためのフラグ
let nextSignInShouldFail = false;

jest.mock("../src/lib/supabase", () => {
  return {
    supabaseAuth: {
      auth: {
        signInWithPassword: jest.fn(async ({ email }: { email: string; password: string }) => {
          if (nextSignInShouldFail) {
            return { data: { session: null }, error: { message: "invalid credentials" } };
          }
          const user = [...usersById.values()].find((u) => u.email === email);
          return {
            data: {
              session: {
                access_token: `access-${user?.id}`,
                refresh_token: `refresh-${user?.id}`,
                expires_in: 3600,
                user: { id: user?.id },
              },
            },
            error: null,
          };
        }),
      },
    },
    supabaseAdmin: {
      from: (_table: string) => ({
        select: () => ({
          eq: (column: string, value: string) => ({
            maybeSingle: async () => {
              const found = [...usersById.values()].find((u) => (u as any)[column] === value);
              return { data: found ?? null, error: null };
            },
          }),
        }),
        update: (patch: Partial<MockUser>) => ({
          eq: async (_column: string, id: string) => {
            const user = usersById.get(id);
            if (user) Object.assign(user, patch);
            return { error: null };
          },
        }),
      }),
      auth: { admin: { signOut: jest.fn(async () => ({ error: null })) } },
    },
  };
});

import { createApp } from "../src/app";

describe("POST /v1/auth/login", () => {
  beforeEach(() => {
    usersById.clear();
    nextSignInShouldFail = false;
  });

  it("returns 400 for invalid request body", async () => {
    const res = await request(createApp()).post("/v1/auth/login").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("returns a generic 401 when the user does not exist (no enumeration)", async () => {
    const res = await request(createApp())
      .post("/v1/auth/login")
      .send({ email: "unknown@example.com", password: "whatever1!" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("invalid_credentials");
  });

  it("returns 423 when the account is locked", async () => {
    makeUser({ locked_until: new Date(Date.now() + 60_000).toISOString() });
    const res = await request(createApp())
      .post("/v1/auth/login")
      .send({ email: "learner@example.com", password: "whatever1!" });
    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe("account_locked");
  });

  it("increments failed_login_count on wrong password and locks after the max attempts", async () => {
    const user = makeUser({ failed_login_count: 4 });
    nextSignInShouldFail = true;

    const res = await request(createApp())
      .post("/v1/auth/login")
      .send({ email: user.email, password: "wrong-password" });

    expect(res.status).toBe(401);
    const updated = usersById.get(user.id)!;
    expect(updated.failed_login_count).toBe(0);
    expect(updated.locked_until).not.toBeNull();
  });

  it("logs in learners directly without requiring 2FA", async () => {
    const user = makeUser({ role: "learner", totp_enabled: false });
    const res = await request(createApp())
      .post("/v1/auth/login")
      .send({ email: user.email, password: "correct-password1!" });

    expect(res.status).toBe(200);
    expect(res.body.requiresTwoFactor).toBe(false);
    expect(res.body.accessToken).toBe(`access-${user.id}`);
  });

  it("requires 2FA for admins with totp enabled and withholds the real tokens", async () => {
    const user = makeUser({ role: "admin", totp_enabled: true, totp_secret: "encrypted-secret" });
    const res = await request(createApp())
      .post("/v1/auth/login")
      .send({ email: user.email, password: "correct-password1!" });

    expect(res.status).toBe(200);
    expect(res.body.requiresTwoFactor).toBe(true);
    expect(res.body.pendingToken).toBeDefined();
    expect(res.body.accessToken).toBeUndefined();
  });
});
