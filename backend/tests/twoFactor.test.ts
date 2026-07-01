import request from "supertest";
import { authenticator } from "otplib";

type MockUser = {
  id: string;
  email: string;
  role: "learner" | "admin" | "super_admin";
  is_active: boolean;
  totp_secret: string | null;
  totp_enabled: boolean;
  last_name: string;
  first_name: string;
};

const usersById = new Map<string, MockUser>();

jest.mock("../src/lib/supabase", () => ({
  supabaseAuth: { auth: { signInWithPassword: jest.fn() } },
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
    auth: {
      getUser: jest.fn(async (token: string) => {
        const id = token.replace("access-", "");
        return usersById.has(id) ? { data: { user: { id } }, error: null } : { data: { user: null }, error: { message: "invalid" } };
      }),
      admin: { signOut: jest.fn(async () => ({ error: null })) },
    },
  },
}));

import { createApp } from "../src/app";

function makeUser(overrides: Partial<MockUser>): MockUser {
  const id = overrides.id ?? "00000000-0000-0000-0000-0000000000bb";
  const user: MockUser = {
    id,
    email: "admin@example.com",
    role: "admin",
    is_active: true,
    totp_secret: null,
    totp_enabled: false,
    last_name: "管理",
    first_name: "者",
    ...overrides,
  };
  usersById.set(id, user);
  return user;
}

describe("POST /v1/auth/2fa/setup", () => {
  beforeEach(() => usersById.clear());

  it("rejects unauthenticated requests", async () => {
    const res = await request(createApp()).post("/v1/auth/2fa/setup");
    expect(res.status).toBe(401);
  });

  it("rejects non-admin roles", async () => {
    const user = makeUser({ role: "learner" });
    const res = await request(createApp())
      .post("/v1/auth/2fa/setup")
      .set("Authorization", `Bearer access-${user.id}`);
    expect(res.status).toBe(403);
  });

  it("issues a secret and QR code for admins, without enabling 2FA yet", async () => {
    const user = makeUser({ role: "admin" });
    const res = await request(createApp())
      .post("/v1/auth/2fa/setup")
      .set("Authorization", `Bearer access-${user.id}`);

    expect(res.status).toBe(200);
    expect(res.body.secret).toBeDefined();
    expect(res.body.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(usersById.get(user.id)!.totp_enabled).toBe(false);
    expect(usersById.get(user.id)!.totp_secret).not.toBeNull();
  });
});

describe("POST /v1/auth/2fa/verify", () => {
  beforeEach(() => usersById.clear());

  it("returns 400 when setup was never called", async () => {
    const user = makeUser({ role: "admin", totp_secret: null });
    const res = await request(createApp())
      .post("/v1/auth/2fa/verify")
      .set("Authorization", `Bearer access-${user.id}`)
      .send({ code: "123456" });
    expect(res.status).toBe(400);
  });

  it("enables 2FA once the correct code is provided", async () => {
    const secret = authenticator.generateSecret();
    const user = makeUser({ role: "admin" });

    const setupRes = await request(createApp())
      .post("/v1/auth/2fa/setup")
      .set("Authorization", `Bearer access-${user.id}`);
    expect(setupRes.status).toBe(200);
    const issuedSecret = setupRes.body.secret as string;

    const code = authenticator.generate(issuedSecret);
    const verifyRes = await request(createApp())
      .post("/v1/auth/2fa/verify")
      .set("Authorization", `Bearer access-${user.id}`)
      .send({ code });

    expect(verifyRes.status).toBe(200);
    expect(usersById.get(user.id)!.totp_enabled).toBe(true);
  });
});
