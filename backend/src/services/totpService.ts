import { authenticator } from "otplib";

export function verifyTotpCode(secret: string, code: string): boolean {
  authenticator.options = { window: 1 };
  return authenticator.check(code, secret);
}

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function buildOtpAuthUrl(secret: string, email: string): string {
  return authenticator.keyuri(email, "HS-LMS", secret);
}
