import request from "supertest";
import { authenticator } from "otplib";

type MockUser = {
  id: string;
  email: string;
  role: "learner" | "admin" | "super_admin";
  is_active: boolean;
  totp_secret: string | null;
  totp_enabled: boolean;
  failed_login_count: number;
  locked_until: string | null;
  last_login_at: string | null;
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
    auth: { admin: { signOut: jest.fn(async () => ({ error: null })) } },
  },
}));

import { createApp } from "../src/app";
import { createMfaPendingToken } from "../src/services/mfaPendingToken";
import { encryptSecret } from "../src/lib/crypto";

describe("POST /v1/auth/login/2fa", () => {
  const userId = "00000000-0000-0000-0000-000000000099";
  const totpSecret = authenticator.generateSecret();

  beforeEach(() => {
    usersById.clear();
    usersById.set(userId, {
      id: userId,
      email: "admin@example.com",
      role: "admin",
      is_active: true,
      totp_secret: encryptSecret(totpSecret),
      totp_enabled: true,
      failed_login_count: 0,
      locked_until: null,
      last_login_at: null,
      last_name: "管理",
      first_name: "者",
    });
  });

  it("returns 401 for an invalid TOTP code", async () => {
    const pendingToken = createMfaPendingToken(userId, "access-token", "refresh-token");
    const res = await request(createApp()).post("/v1/auth/login/2fa").send({ pendingToken, code: "000000" });
    expect(res.status).toBe(401);
  });

  it("returns the withheld session once the correct TOTP code is verified", async () => {
    const pendingToken = createMfaPendingToken(userId, "access-token", "refresh-token");
    const code = authenticator.generate(totpSecret);

    const res = await request(createApp()).post("/v1/auth/login/2fa").send({ pendingToken, code });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe("access-token");
    expect(res.body.refreshToken).toBe("refresh-token");
  });

  it("rejects an expired or tampered pending token", async () => {
    const res = await request(createApp())
      .post("/v1/auth/login/2fa")
      .send({ pendingToken: "not-a-real-token", code: "123456" });
    expect(res.status).toBe(401);
  });
});
