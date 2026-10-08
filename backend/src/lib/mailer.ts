import { env } from "../config/env";

// メール送信は Google Apps Script（GAS）のWebアプリに中継する。
// Renderの無料プランはSMTPポート(25/465/587)の外向き通信を遮断するため、
// SMTP(Nodemailer等)は使えない。GASへはHTTPS(443)で通信できる。
// GAS側のコードは docs/gas-mailer/Code.gs を参照。
const REQUEST_TIMEOUT_MS = 20_000;

type GasResponse = { ok?: boolean; error?: string };

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!env.GAS_MAIL_URL || !env.GAS_MAIL_SECRET) {
    throw new Error("GAS_MAIL_URL / GAS_MAIL_SECRET が設定されていません");
  }

  let response: Response;
  try {
    // GASのWebアプリはリクエストヘッダーを読めないため、共有シークレットは本文に含める。
    // GASは処理後に302でリダイレクトするが、fetchは自動追従する（本文は最初のPOSTで処理済み）。
    response = await fetch(env.GAS_MAIL_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ secret: env.GAS_MAIL_SECRET, to, subject, html }),
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`GAS経由のメール送信リクエストに失敗しました: ${message}`);
  }

  let body: GasResponse | null = null;
  try {
    body = (await response.json()) as GasResponse;
  } catch {
    body = null;
  }

  if (!response.ok || !body?.ok) {
    const detail = body?.error ?? `HTTP ${response.status}`;
    throw new Error(`GAS経由のメール送信に失敗しました: ${detail}`);
  }
}
