import request from "supertest";
import { createApp } from "../src/app";

// Render等のプロキシ配下では、X-Forwarded-For の接続元IPごとにレート制限が数えられること
describe("trust proxy / rate limiting per client IP", () => {
  it("counts unauthenticated requests separately for each X-Forwarded-For client", async () => {
    const app = createApp();

    // 未認証は1分あたり10回まで。クライアントAが上限に達しても、クライアントBは影響を受けない。
    for (let i = 0; i < 10; i += 1) {
      const res = await request(app).get("/health").set("X-Forwarded-For", "203.0.113.10");
      expect(res.status).toBe(200);
    }
    const blocked = await request(app).get("/health").set("X-Forwarded-For", "203.0.113.10");
    expect(blocked.status).toBe(429);

    const other = await request(app).get("/health").set("X-Forwarded-For", "203.0.113.20");
    expect(other.status).toBe(200);
  });
});
