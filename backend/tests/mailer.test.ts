const envMock: { GAS_MAIL_URL?: string; GAS_MAIL_SECRET?: string } = {};

jest.mock("../src/config/env", () => ({ env: envMock }));

import { sendEmail } from "../src/lib/mailer";

const GAS_URL = "https://script.google.com/macros/s/test/exec";

function mockFetchResponse(init: { ok: boolean; status?: number; json?: unknown; jsonThrows?: boolean }) {
  (global as any).fetch = jest.fn().mockResolvedValue({
    ok: init.ok,
    status: init.status ?? (init.ok ? 200 : 500),
    json: init.jsonThrows ? async () => { throw new Error("not json"); } : async () => init.json,
  });
}

describe("sendEmail (GAS relay)", () => {
  beforeEach(() => {
    envMock.GAS_MAIL_URL = GAS_URL;
    envMock.GAS_MAIL_SECRET = "test-shared-secret-1234";
  });

  it("throws without calling fetch when GAS settings are missing", async () => {
    delete envMock.GAS_MAIL_URL;
    (global as any).fetch = jest.fn();

    await expect(sendEmail("a@example.com", "s", "<p>h</p>")).rejects.toThrow("GAS_MAIL_URL");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("POSTs the secret, recipient, subject and html to the GAS web app", async () => {
    mockFetchResponse({ ok: true, json: { ok: true } });

    await sendEmail("a@example.com", "件名", "<p>本文</p>");

    expect(global.fetch).toHaveBeenCalledWith(
      GAS_URL,
      expect.objectContaining({ method: "POST", redirect: "follow" }),
    );
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body).toEqual({ secret: "test-shared-secret-1234", to: "a@example.com", subject: "件名", html: "<p>本文</p>" });
  });

  it("throws with the GAS error message when GAS reports failure", async () => {
    mockFetchResponse({ ok: true, json: { ok: false, error: "unauthorized" } });
    await expect(sendEmail("a@example.com", "s", "h")).rejects.toThrow("unauthorized");
  });

  it("throws on a non-JSON or non-2xx response", async () => {
    mockFetchResponse({ ok: false, status: 500, jsonThrows: true });
    await expect(sendEmail("a@example.com", "s", "h")).rejects.toThrow("HTTP 500");
  });

  it("throws when the request itself fails (network error)", async () => {
    (global as any).fetch = jest.fn().mockRejectedValue(new Error("network down"));
    await expect(sendEmail("a@example.com", "s", "h")).rejects.toThrow("network down");
  });
});
