process.env.DEFAULT_USER_PASSWORD = "TestPass1!";

import request from "supertest";

jest.mock("../src/lib/supabase", () => {
  const { createFakeDb } = require("./helpers/fakeSupabase");
  const fakeDb = createFakeDb();
  let counter = 0;

  const createUserMock = jest.fn(async ({ email }: { email: string; password: string; email_confirm: boolean }) => {
    const id = `auth-${++counter}`;
    return { data: { user: { id, email } }, error: null };
  });

  return {
    __fakeDb: fakeDb,
    __createUserMock: createUserMock,
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
          deleteUser: jest.fn(async () => ({ error: null })),
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

function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
  const id = (overrides.id as string) ?? `user-${Math.random().toString(36).slice(2, 8)}`;
  const user = {
    id,
    email: `${id}@example.com`,
    role: "admin",
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

beforeEach(() => {
  fakeDb.store.set("users", []);
  createUserMock.mockClear();
  (global as any).fetch = jest.fn(async () => ({ ok: true, text: async () => "", json: async () => ({}) }));
});

describe("DEFAULT_USER_PASSWORD環境変数", () => {
  it("設定されている場合、手動作成の初期パスワードとして固定値が使われる", async () => {
    const admin = makeUser({});

    const res = await request(createApp())
      .post("/v1/users")
      .set(authHeader(admin))
      .send({ lastName: "鈴木", firstName: "花子", email: "suzuki@example.com", role: "learner" });

    expect(res.status).toBe(201);
    expect(createUserMock).toHaveBeenCalledWith(expect.objectContaining({ password: "TestPass1!" }));
  });

  it("設定されている場合、CSVインポートの初期パスワードとしても固定値が使われる", async () => {
    const admin = makeUser({});
    const csv = ["姓,名,メールアドレス,ロール,部署,入社日,グループ", "田中,一郎,tanaka@example.com,learner,,,"].join("\n");

    const res = await request(createApp())
      .post("/v1/users/import")
      .set(authHeader(admin))
      .attach("file", Buffer.from(csv, "utf-8"), "users.csv");

    expect(res.status).toBe(201);
    expect(createUserMock).toHaveBeenCalledWith(expect.objectContaining({ password: "TestPass1!" }));
  });
});
