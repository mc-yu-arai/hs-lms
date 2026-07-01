import request from "supertest";

type MockUser = {
  id: string;
  email: string;
  role: "learner" | "admin" | "super_admin";
  is_active: boolean;
  totp_enabled: boolean;
  last_login_at: string | null;
};

const usersById = new Map<string, MockUser>();

let signInWithOAuthImpl = jest.fn();
let exchangeCodeForSessionImpl = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      signInWithOAuth: (...args: unknown[]) => signInWithOAuthImpl(...args),
      exchangeCodeForSession: (...args: unknown[]) => exchangeCodeForSessionImpl(...args),
    },
  }),
}));

jest.mock("../src/lib/supabase", () => ({
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
  supabaseAuth: { auth: { signInWithPassword: jest.fn() } },
}));

import { createApp } from "../src/app";

describe("GET /v1/auth/oauth/google", () => {
  beforeEach(() => {
    usersById.clear();
    signInWithOAuthImpl = jest.fn(async () => ({ data: { url: "https://project.supabase.co/auth/v1/authorize?provider=google" }, error: null }));
    exchangeCodeForSessionImpl = jest.fn();
  });

  it("redirects to the Supabase-provided authorize URL and sets a PKCE cookie", async () => {
    const res = await request(createApp()).get("/v1/auth/oauth/google");
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("supabase.co/auth/v1/authorize");
    expect(res.headers["set-cookie"]?.[0]).toContain("hslms_oauth_pkce=");
  });
});

describe("GET /v1/auth/oauth/google/callback", () => {
  const userId = "00000000-0000-0000-0000-0000000000aa";

  beforeEach(() => {
    usersById.clear();
    signInWithOAuthImpl = jest.fn(async () => ({ data: { url: "https://project.supabase.co/auth/v1/authorize?provider=google" }, error: null }));
  });

  async function getPkceCookie(agent: ReturnType<typeof request.agent>) {
    const startRes = await agent.get("/v1/auth/oauth/google");
    const setCookie = startRes.headers["set-cookie"]?.[0] as string;
    return setCookie.split(";")[0];
  }

  it("returns 400 when the authorization code is missing", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await getPkceCookie(agent);
    const res = await agent.get("/v1/auth/oauth/google/callback");
    expect(res.status).toBe(400);
  });

  it("redirects to login with an error when the user is not pre-provisioned", async () => {
    exchangeCodeForSessionImpl = jest.fn(async () => ({
      data: { session: { access_token: "at", refresh_token: "rt", expires_in: 3600, user: { id: userId } } },
      error: null,
    }));

    const app = createApp();
    const agent = request.agent(app);
    await getPkceCookie(agent);
    const res = await agent.get("/v1/auth/oauth/google/callback?code=abc123");

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/login?error=");
  });

  it("redirects to the frontend with tokens in the URL fragment for a provisioned learner", async () => {
    usersById.set(userId, {
      id: userId,
      email: "learner@example.com",
      role: "learner",
      is_active: true,
      totp_enabled: false,
      last_login_at: null,
    });
    exchangeCodeForSessionImpl = jest.fn(async () => ({
      data: { session: { access_token: "at-123", refresh_token: "rt-123", expires_in: 3600, user: { id: userId } } },
      error: null,
    }));

    const app = createApp();
    const agent = request.agent(app);
    await getPkceCookie(agent);
    const res = await agent.get("/v1/auth/oauth/google/callback?code=abc123");

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/auth/callback#");
    expect(res.headers.location).toContain("access_token=at-123");
  });

  it("routes admins with 2FA enabled to the pending-token flow instead of returning tokens directly", async () => {
    usersById.set(userId, {
      id: userId,
      email: "admin@example.com",
      role: "admin",
      is_active: true,
      totp_enabled: true,
      last_login_at: null,
    });
    exchangeCodeForSessionImpl = jest.fn(async () => ({
      data: { session: { access_token: "at-admin", refresh_token: "rt-admin", expires_in: 3600, user: { id: userId } } },
      error: null,
    }));

    const app = createApp();
    const agent = request.agent(app);
    await getPkceCookie(agent);
    const res = await agent.get("/v1/auth/oauth/google/callback?code=abc123");

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/auth/2fa?pendingToken=");
    expect(res.headers.location).not.toContain("at-admin");
  });
});
