import request from "supertest";
import AdmZip from "adm-zip";

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
        from: () => ({
          upload: (...args: unknown[]) => uploadMock(...(args as [any, any, any])),
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

function buildZip(files: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [entryPath, content] of Object.entries(files)) {
    zip.addFile(entryPath, Buffer.from(content, "utf-8"));
  }
  return zip.toBuffer();
}

const SCORM_12_MANIFEST = `<?xml version="1.0"?><manifest><metadata><schemaversion>1.2</schemaversion></metadata></manifest>`;
const SCORM_2004_MANIFEST = `<?xml version="1.0"?><manifest><metadata><schemaversion>2004 3rd Edition</schemaversion></metadata></manifest>`;

beforeEach(() => {
  fakeDb.store.set("users", []);
  uploadMock.mockClear();
});

describe("POST /v1/uploads/lesson-content", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(createApp())
      .post("/v1/uploads/lesson-content")
      .attach("file", buildZip({ "index.html": "<html></html>", "imsmanifest.xml": SCORM_12_MANIFEST }), "package.zip");
    expect(res.status).toBe(401);
  });

  it("forbids learners", async () => {
    const learner = makeUser({ role: "learner" });
    const res = await request(createApp())
      .post("/v1/uploads/lesson-content")
      .set(authHeader(learner))
      .attach("file", buildZip({ "index.html": "<html></html>", "imsmanifest.xml": SCORM_12_MANIFEST }), "package.zip");
    expect(res.status).toBe(403);
  });

  it("rejects non-zip files", async () => {
    const admin = makeUser({ role: "admin" });
    const res = await request(createApp())
      .post("/v1/uploads/lesson-content")
      .set(authHeader(admin))
      .attach("file", Buffer.from("hello"), "package.txt");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_file");
  });

  it("detects SCORM 1.2 packages and uploads all entries", async () => {
    const admin = makeUser({ role: "admin" });
    const res = await request(createApp())
      .post("/v1/uploads/lesson-content")
      .set(authHeader(admin))
      .attach(
        "file",
        buildZip({
          "index.html": "<html></html>",
          "imsmanifest.xml": SCORM_12_MANIFEST,
          "assets/style.css": "body{}",
        }),
        "package.zip",
      );

    expect(res.status).toBe(201);
    expect(res.body.contentType).toBe("scorm");
    expect(res.body.scormVersion).toBe("1.2");
    expect(res.body.contentUrl).toMatch(/^lesson-content\/[0-9a-f-]+\/index\.html$/);
    expect(uploadMock).toHaveBeenCalledTimes(3);
  });

  it("detects SCORM 2004 packages from the schemaversion text", async () => {
    const admin = makeUser({ role: "admin" });
    const res = await request(createApp())
      .post("/v1/uploads/lesson-content")
      .set(authHeader(admin))
      .attach("file", buildZip({ "index.html": "<html></html>", "imsmanifest.xml": SCORM_2004_MANIFEST }), "package.zip");

    expect(res.status).toBe(201);
    expect(res.body.scormVersion).toBe("2004");
  });

  it("detects LearnWiz packages via lwConfig.xml", async () => {
    const admin = makeUser({ role: "admin" });
    const res = await request(createApp())
      .post("/v1/uploads/lesson-content")
      .set(authHeader(admin))
      .attach("file", buildZip({ "index.html": "<html></html>", "lwConfig.xml": "<config/>" }), "package.zip");

    expect(res.status).toBe(201);
    expect(res.body.contentType).toBe("learnwiz");
    expect(res.body.scormVersion).toBeNull();
  });

  it("rejects packages without imsmanifest.xml or lwConfig.xml", async () => {
    const admin = makeUser({ role: "admin" });
    const res = await request(createApp())
      .post("/v1/uploads/lesson-content")
      .set(authHeader(admin))
      .attach("file", buildZip({ "index.html": "<html></html>" }), "package.zip");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_lesson_content");
  });

  it("rejects packages without an index.html entry point", async () => {
    const admin = makeUser({ role: "admin" });
    const res = await request(createApp())
      .post("/v1/uploads/lesson-content")
      .set(authHeader(admin))
      .attach("file", buildZip({ "imsmanifest.xml": SCORM_12_MANIFEST, "start.html": "<html></html>" }), "package.zip");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_lesson_content");
  });
});
