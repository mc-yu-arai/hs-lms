import request from "supertest";

type MockUser = {
  id: string;
  email: string;
  is_active: boolean;
};

const usersById = new Map<string, MockUser>();
const generateLinkMock = jest.fn();

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
    }),
    auth: { admin: { generateLink: (...args: unknown[]) => generateLinkMock(...args) } },
  },
}));

import { createApp } from "../src/app";

function makeUser(overrides: Partial<MockUser>): MockUser {
  const id = overrides.id ?? "00000000-0000-0000-0000-0000000000dd";
  const user: MockUser = { id, email: "learner@example.com", is_active: true, ...overrides };
  usersById.set(id, user);
  return user;
}

describe("POST /v1/auth/password/reset", () => {
  beforeEach(() => {
    usersById.clear();
    generateLinkMock.mockReset();
    (global as any).fetch = jest.fn(async () => ({ ok: true, text: async () => "", json: async () => ({}) }));
  });

  it("returns the same generic success message for an unknown email (no enumeration)", async () => {
    const res = await request(createApp())
      .post("/v1/auth/password/reset")
      .send({ email: "unknown@example.com" });

    expect(res.status).toBe(200);
    expect(generateLinkMock).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("generates a recovery link and sends it via Resend for a known active user", async () => {
    generateLinkMock.mockResolvedValue({ data: { properties: { action_link: "https://project.supabase.co/auth/v1/verify?token=abc&type=recovery" } }, error: null });
    const user = makeUser({});

    const res = await request(createApp())
      .post("/v1/auth/password/reset")
      .send({ email: user.email });

    expect(res.status).toBe(200);
    expect(generateLinkMock).toHaveBeenCalledWith(expect.objectContaining({ type: "recovery", email: user.email }));
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("still returns 200 when the email provider rejects the send (e.g. Resend sandbox restriction)", async () => {
    generateLinkMock.mockResolvedValue({ data: { properties: { action_link: "https://project.supabase.co/auth/v1/verify?token=abc&type=recovery" } }, error: null });
    (global as any).fetch = jest.fn(async () => ({ ok: false, status: 403, text: async () => "sandbox restriction" }));
    const user = makeUser({});

    const res = await request(createApp())
      .post("/v1/auth/password/reset")
      .send({ email: user.email });

    expect(res.status).toBe(200);
  });

  it("does not attempt to send a reset link for a disabled account", async () => {
    const user = makeUser({ is_active: false });

    const res = await request(createApp())
      .post("/v1/auth/password/reset")
      .send({ email: user.email });

    expect(res.status).toBe(200);
    expect(generateLinkMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid email format", async () => {
    const res = await request(createApp()).post("/v1/auth/password/reset").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
  });
});

describe("PUT /v1/auth/password/update", () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn();
  });

  it("rejects passwords that do not satisfy the policy", async () => {
    const res = await request(createApp())
      .put("/v1/auth/password/update")
      .send({ token: "recovery-access-token", newPassword: "weakpass" });

    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("updates the password via the GoTrue REST API when the token and password are valid", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });

    const res = await request(createApp())
      .put("/v1/auth/password/update")
      .send({ token: "recovery-access-token", newPassword: "NewPassw0rd!" });

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/v1/user"),
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ Authorization: "Bearer recovery-access-token" }),
      }),
    );
  });

  it("surfaces a 400 when the recovery token is invalid or expired", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, json: async () => ({ msg: "token expired" }) });

    const res = await request(createApp())
      .put("/v1/auth/password/update")
      .send({ token: "expired-token", newPassword: "NewPassw0rd!" });

    expect(res.status).toBe(400);
  });
});
