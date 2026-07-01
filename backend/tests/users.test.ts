import request from "supertest";

type MockUser = {
  id: string;
  email: string;
  role: "learner" | "admin" | "super_admin";
  is_active: boolean;
  last_name: string;
  first_name: string;
  department: string | null;
  hire_date: string | null;
  last_login_at: string | null;
  totp_enabled: boolean;
  totp_secret: string | null;
};

const usersById = new Map<string, MockUser>();
type StorageFile = { path: string; buffer: Buffer; contentType: string };
const storageFiles = new Map<string, StorageFile>();

function makeUpdateEq(usersById: Map<string, MockUser>, patch: Partial<MockUser>) {
  return (_column: string, id: string) => {
    const promise: any = (async () => {
      const user = usersById.get(id);
      if (user) Object.assign(user, patch);
      return { error: null };
    })();
    promise.select = () => ({
      maybeSingle: async () => ({ data: usersById.get(id) ?? null, error: null }),
    });
    return promise;
  };
}

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
      update: (patch: Partial<MockUser>) => ({ eq: makeUpdateEq(usersById, patch) }),
    }),
    auth: {
      getUser: jest.fn(async (token: string) => {
        const id = token.replace("access-", "");
        return usersById.has(id) ? { data: { user: { id, email: usersById.get(id)!.email } }, error: null } : { data: { user: null }, error: { message: "invalid" } };
      }),
      admin: { signOut: jest.fn(async () => ({ error: null })) },
    },
    storage: {
      from: (bucket: string) => ({
        upload: jest.fn(async (path: string, buffer: Buffer, opts: { contentType: string }) => {
          storageFiles.set(`${bucket}/${path}`, { path, buffer, contentType: opts.contentType });
          return { error: null };
        }),
        remove: jest.fn(async (paths: string[]) => {
          for (const p of paths) storageFiles.delete(`${bucket}/${p}`);
          return { error: null };
        }),
        list: jest.fn(async (folder: string) => {
          const names = [...storageFiles.keys()]
            .filter((k) => k.startsWith(`${bucket}/${folder}/`))
            .map((k) => k.split("/").pop()!);
          return { data: names.map((name) => ({ name })), error: null };
        }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${bucket}/${path}` } }),
      }),
    },
  },
}));

import { createApp } from "../src/app";

function makeUser(overrides: Partial<MockUser>): MockUser {
  const id = overrides.id ?? "00000000-0000-0000-0000-0000000000cc";
  const user: MockUser = {
    id,
    email: "learner@example.com",
    role: "learner",
    is_active: true,
    last_name: "山田",
    first_name: "太郎",
    department: "営業部",
    hire_date: null,
    last_login_at: null,
    totp_enabled: false,
    totp_secret: null,
    ...overrides,
  };
  usersById.set(id, user);
  return user;
}

describe("GET /v1/users/me", () => {
  beforeEach(() => {
    usersById.clear();
    storageFiles.clear();
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(createApp()).get("/v1/users/me");
    expect(res.status).toBe(401);
  });

  it("returns the profile with avatarUrl null when no avatar was uploaded", async () => {
    const user = makeUser({});
    const res = await request(createApp()).get("/v1/users/me").set("Authorization", `Bearer access-${user.id}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user.avatarUrl).toBeNull();
  });
});

describe("PUT /v1/users/me", () => {
  beforeEach(() => {
    usersById.clear();
    storageFiles.clear();
    (global as any).fetch = jest.fn();
  });

  it("updates profile fields without touching email when email is unchanged", async () => {
    const user = makeUser({});
    const res = await request(createApp())
      .put("/v1/users/me")
      .set("Authorization", `Bearer access-${user.id}`)
      .send({ lastName: "鈴木", department: "人事部" });

    expect(res.status).toBe(200);
    expect(res.body.emailChangeRequested).toBe(false);
    expect(usersById.get(user.id)!.last_name).toBe("鈴木");
    expect(usersById.get(user.id)!.department).toBe("人事部");
  });

  it("requests a confirmation email via Supabase Auth REST and does not change email immediately", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = makeUser({});

    const res = await request(createApp())
      .put("/v1/users/me")
      .set("Authorization", `Bearer access-${user.id}`)
      .send({ email: "new-address@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.emailChangeRequested).toBe(true);
    expect(usersById.get(user.id)!.email).toBe("learner@example.com");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/v1/user"),
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("propagates an error when Supabase rejects the email change", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, json: async () => ({ msg: "email already in use" }) });
    const user = makeUser({});

    const res = await request(createApp())
      .put("/v1/users/me")
      .set("Authorization", `Bearer access-${user.id}`)
      .send({ email: "taken@example.com" });

    expect(res.status).toBe(400);
  });
});

describe("POST /v1/users/me/avatar", () => {
  beforeEach(() => {
    usersById.clear();
    storageFiles.clear();
  });

  it("returns 400 when no file is attached", async () => {
    const user = makeUser({});
    const res = await request(createApp())
      .post("/v1/users/me/avatar")
      .set("Authorization", `Bearer access-${user.id}`);
    expect(res.status).toBe(400);
  });

  it("uploads a PNG avatar and returns its public URL", async () => {
    const user = makeUser({});
    const res = await request(createApp())
      .post("/v1/users/me/avatar")
      .set("Authorization", `Bearer access-${user.id}`)
      .attach("avatar", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "avatar.png", contentType: "image/png" });

    expect(res.status).toBe(200);
    expect(res.body.avatarUrl).toContain(`avatars/${user.id}/avatar.png`);
  });

  it("rejects unsupported file types", async () => {
    const user = makeUser({});
    const res = await request(createApp())
      .post("/v1/users/me/avatar")
      .set("Authorization", `Bearer access-${user.id}`)
      .attach("avatar", Buffer.from("not an image"), { filename: "file.txt", contentType: "text/plain" });

    expect(res.status).toBe(400);
  });

  it("rejects files larger than 2MB", async () => {
    const user = makeUser({});
    const bigBuffer = Buffer.alloc(3 * 1024 * 1024, 1);
    const res = await request(createApp())
      .post("/v1/users/me/avatar")
      .set("Authorization", `Bearer access-${user.id}`)
      .attach("avatar", bigBuffer, { filename: "big.png", contentType: "image/png" });

    expect(res.status).toBe(413);
  });
});
