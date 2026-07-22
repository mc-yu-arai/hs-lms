import request from "supertest";

jest.mock("../src/lib/supabase", () => {
  const { createFakeDb } = require("./helpers/fakeSupabase");
  const fakeDb = createFakeDb();

  const uploadMock = jest.fn(async (_path: string, _data: Buffer, _opts: unknown) => ({ data: {}, error: null }));

  return {
    __fakeDb: fakeDb,
    __uploadMock: uploadMock,
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
      storage: {
        from: (bucket: string) => ({
          upload: (...args: unknown[]) => uploadMock(...(args as [any, any, any])),
          getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${bucket}/${path}` } }),
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
const uploadMock = supabaseModule.__uploadMock as jest.Mock;

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

beforeEach(() => {
  fakeDb.store.set("users", []);
  uploadMock.mockClear();
});

describe("POST /v1/uploads/lesson-video", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(createApp())
      .post("/v1/uploads/lesson-video")
      .attach("file", Buffer.from("fake video bytes"), "lesson.mp4");
    expect(res.status).toBe(401);
  });

  it("forbids learners", async () => {
    const learner = makeUser({ role: "learner" });
    const res = await request(createApp())
      .post("/v1/uploads/lesson-video")
      .set(authHeader(learner))
      .attach("file", Buffer.from("fake video bytes"), "lesson.mp4");
    expect(res.status).toBe(403);
  });

  it("rejects unsupported file extensions", async () => {
    const admin = makeUser({ role: "admin" });
    const res = await request(createApp())
      .post("/v1/uploads/lesson-video")
      .set(authHeader(admin))
      .attach("file", Buffer.from("not a video"), "lesson.txt");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_file");
  });

  it.each(["lesson.mp4", "lesson.mov", "lesson.avi", "LESSON.MP4"])(
    "uploads %s and returns its public URL",
    async (filename) => {
      const admin = makeUser({ role: "admin" });
      const res = await request(createApp())
        .post("/v1/uploads/lesson-video")
        .set(authHeader(admin))
        .attach("file", Buffer.from("fake video bytes"), filename);

      expect(res.status).toBe(201);
      expect(res.body.contentUrl).toMatch(/^https:\/\/storage\.test\/videos\/[0-9a-f-]+\.[a-z0-9]+$/);
      expect(uploadMock).toHaveBeenCalledTimes(1);
    },
  );
});
