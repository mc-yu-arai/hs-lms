import nodemailer from "nodemailer";
import { env } from "../config/env";

// Gmail（無料のGoogleアカウントでも可）のSMTPを使ってメールを送信する。
// GMAIL_USER / GMAIL_APP_PASSWORD は、Googleアカウントで2段階認証を有効化した上で
// 発行する「アプリパスワード」を設定すること（通常のログインパスワードは使用できない）。
// https://myaccount.google.com/apppasswords
let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) {
    throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD が設定されていません");
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: env.GMAIL_USER,
        pass: env.GMAIL_APP_PASSWORD,
      },
    });
  }

  return transporter;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const client = getTransporter();

  try {
    await client.sendMail({
      from: env.GMAIL_USER,
      to,
      subject,
      html,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Gmail SMTPでのメール送信に失敗しました: ${message}`);
  }
}
