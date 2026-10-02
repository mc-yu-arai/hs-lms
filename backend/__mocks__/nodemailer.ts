// nodemailerのJest自動モック。
// __mocks__/<module>.ts に置くと、Node標準モジュール（node_modulesのパッケージ）に対しては
// jest.mock("nodemailer") を各テストファイルで呼ばなくても自動的に適用される。
// これが無いと、メール送信を経由するテスト（コース修了通知・グループ操作等）で
// 実際にGmailのSMTPサーバーへ接続を試みてタイムアウトしてしまう。
const sendMail = jest.fn(async () => ({ messageId: "mock-message-id" }));

const createTransport = jest.fn(() => ({ sendMail }));

export default { createTransport };
export { createTransport, sendMail };
