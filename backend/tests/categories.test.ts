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
        admin: { signOut: jest.fn(async () => ({ error: null })) },
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
    ...overrides,
  };
  fakeDb.store.get("users")!.push(user);
  return user;
}

function authHeader(user: { id: string }) {
  return { Authorization: `Bearer access-${user.id}` };
}

function makeCourseRow(overrides: Partial<Record<string, unknown>> = {}) {
  const course = {
    id: (overrides.id as string) ?? `course-${Math.random().toString(36).slice(2, 8)}`,
    title: "カテゴリテストコース",
    is_published: true,
    level: "beginner",
    category_id: null,
    ...overrides,
  };
  fakeDb.store.get("courses")!.push(course);
  return course;
}

beforeEach(() => {
  for (const t of ["users", "categories", "courses"]) {
    fakeDb.store.set(t, []);
  }
});

describe("GET /v1/categories", () => {
  it("is accessible without authentication and includes courseCount", async () => {
    fakeDb.store.get("categories")!.push({ id: "cat-1", name: "営業", created_at: new Date().toISOString() });
    makeCourseRow({ category_id: "cat-1" });
    makeCourseRow({ category_id: "cat-1" });

    const res = await request(createApp()).get("/v1/categories");
    expect(res.status).toBe(200);
    expect(res.body.categories).toHaveLength(1);
    expect(res.body.categories[0]).toMatchObject({ name: "営業", courseCount: 2 });
  });
});

describe("POST /v1/categories", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(createApp()).post("/v1/categories").send({ name: "営業" });
    expect(res.status).toBe(401);
  });

  it("forbids learners", async () => {
    const learner = makeUser({ role: "learner" });
    const res = await request(createApp()).post("/v1/categories").set(authHeader(learner)).send({ name: "営業" });
    expect(res.status).toBe(403);
  });

  it("creates a category", async () => {
    const admin = makeUser({ role: "admin" });
    const res = await request(createApp()).post("/v1/categories").set(authHeader(admin)).send({ name: "営業" });
    expect(res.status).toBe(201);
    expect(res.body.category).toMatchObject({ name: "営業" });
  });

  it("rejects a duplicate name", async () => {
    const admin = makeUser({ role: "admin" });
    fakeDb.store.get("categories")!.push({ id: "cat-1", name: "営業", created_at: new Date().toISOString() });

    const res = await request(createApp()).post("/v1/categories").set(authHeader(admin)).send({ name: "営業" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("category_name_exists");
  });
});

describe("PUT /v1/categories/:id", () => {
  it("renames a category", async () => {
    const admin = makeUser({ role: "admin" });
    fakeDb.store.get("categories")!.push({ id: "cat-1", name: "営業", created_at: new Date().toISOString() });

    const res = await request(createApp()).put("/v1/categories/cat-1").set(authHeader(admin)).send({ name: "営業部門" });
    expect(res.status).toBe(200);
    expect(res.body.category.name).toBe("営業部門");
  });

  it("returns 404 for a nonexistent category", async () => {
    const admin = makeUser({ role: "admin" });
    const res = await request(createApp()).put("/v1/categories/nonexistent").set(authHeader(admin)).send({ name: "営業" });
    expect(res.status).toBe(404);
  });

  it("rejects renaming to a name used by another category", async () => {
    const admin = makeUser({ role: "admin" });
    fakeDb.store.get("categories")!.push({ id: "cat-1", name: "営業", created_at: new Date().toISOString() });
    fakeDb.store.get("categories")!.push({ id: "cat-2", name: "人事", created_at: new Date().toISOString() });

    const res = await request(createApp()).put("/v1/categories/cat-2").set(authHeader(admin)).send({ name: "営業" });
    expect(res.status).toBe(409);
  });

  it("allows renaming a category to its own current name", async () => {
    const admin = makeUser({ role: "admin" });
    fakeDb.store.get("categories")!.push({ id: "cat-1", name: "営業", created_at: new Date().toISOString() });

    const res = await request(createApp()).put("/v1/categories/cat-1").set(authHeader(admin)).send({ name: "営業" });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /v1/categories/:id", () => {
  it("deletes a category with no linked courses", async () => {
    const admin = makeUser({ role: "admin" });
    fakeDb.store.get("categories")!.push({ id: "cat-1", name: "営業", created_at: new Date().toISOString() });

    const res = await request(createApp()).delete("/v1/categories/cat-1").set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(fakeDb.store.get("categories")).toHaveLength(0);
  });

  it("rejects deletion when courses are linked", async () => {
    const admin = makeUser({ role: "admin" });
    fakeDb.store.get("categories")!.push({ id: "cat-1", name: "営業", created_at: new Date().toISOString() });
    makeCourseRow({ category_id: "cat-1" });

    const res = await request(createApp()).delete("/v1/categories/cat-1").set(authHeader(admin));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("category_has_courses");
    expect(fakeDb.store.get("categories")).toHaveLength(1);
  });

  it("returns 404 for a nonexistent category", async () => {
    const admin = makeUser({ role: "admin" });
    const res = await request(createApp()).delete("/v1/categories/nonexistent").set(authHeader(admin));
    expect(res.status).toBe(404);
  });
});
