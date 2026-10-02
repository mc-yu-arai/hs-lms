/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  // __mocks__ はnodemailer（Node標準モジュール）の手動モックを自動適用させるためにrootsへ追加。
  // これが無いと、ここに含めないテストファイルでメール送信経路を通った際に実際のSMTP接続を
  // 試みてタイムアウトする。
  roots: ["<rootDir>/tests", "<rootDir>/__mocks__"],
  setupFiles: ["<rootDir>/tests/setupEnv.ts"],
};
