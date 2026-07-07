const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%&*?";

function randomChar(pool: string): string {
  return pool[Math.floor(Math.random() * pool.length)];
}

// 既存のパスワードポリシー（8文字以上・英字/数字/記号混在、backend/src/routes/passwordReset.tsのupdateSchema参照）を
// 必ず満たす形で初期パスワードを生成する
export function generateRandomPassword(length = 12): string {
  const required = [randomChar(LETTERS), randomChar(DIGITS), randomChar(SYMBOLS)];
  const all = LETTERS + DIGITS + SYMBOLS;
  const rest = Array.from({ length: Math.max(length - required.length, 0) }, () => randomChar(all));
  const chars = [...required, ...rest];

  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}
