# API_SPEC

ベースパス: `/v1`（`backend/src/app.ts` で `app.use("/v1/auth", authRouter)`）

## 実装済み

| メソッド | パス | 認証要否 | 概要 |
|---|---|---|---|
| GET | /health | 不要 | 死活監視 |
| POST | /v1/auth/login | 不要 | メール・パスワードログイン。admin/super_adminかつtotp_enabledの場合は`requiresTwoFactor:true`と`pendingToken`を返し、実トークンは返さない |
| POST | /v1/auth/login/2fa | 仮トークン(`pendingToken`)要 | TOTPコード検証。成功時に本来の`accessToken`/`refreshToken`を返す |
| POST | /v1/auth/logout | Bearer要 | Supabase Admin APIでアクセストークンを無効化（`scope: global`） |
| POST | /v1/auth/refresh | リフレッシュトークン要 | Supabaseの`refreshSession`をラップ。アカウント無効時は403 |

### リクエスト/レスポンス例

**POST /v1/auth/login**
```json
// request
{ "email": "user@example.com", "password": "P@ssw0rd1" }

// response (2FA不要な場合)
{ "requiresTwoFactor": false, "accessToken": "...", "refreshToken": "...", "expiresIn": 3600,
  "user": { "id": "...", "email": "...", "lastName": "...", "firstName": "...", "role": "learner" } }

// response (adminで2FA必須の場合)
{ "requiresTwoFactor": true, "pendingToken": "..." }
```

**POST /v1/auth/login/2fa**
```json
// request
{ "pendingToken": "...", "code": "123456" }
// response
{ "accessToken": "...", "refreshToken": "...", "user": { ... } }
```

**エラーレスポンス共通形式**
```json
{ "error": { "code": "invalid_credentials", "message": "メールアドレスまたはパスワードが正しくありません" } }
```
主なエラーコード: `validation_error`(400) / `invalid_credentials`(401) / `account_disabled`(403) / `account_locked`(423) / `invalid_pending_token`(401) / `invalid_totp_code`(401) / `unauthorized`(401) / `too_many_requests`(429)

## 未実装（仕様書・指示書に定義済み）

| メソッド | パス | 認証要否 | 備考 |
|---|---|---|---|
| GET | /auth/oauth/google | 不要 | Google Client ID/Secretは.env設定済み、実装待ち |
| GET | /auth/oauth/google/callback | 不要 | 同上 |
| POST | /auth/password/reset | 不要 | **Resend APIキー未設定のため着手待ち** |
| PUT | /auth/password/update | リセットトークン要 | 同上 |
| POST | /auth/2fa/setup | 要・admin限定 | TOTPシークレット発行・QRコード |
| POST | /auth/2fa/verify | 要・admin限定 | 2FA初回有効化検証 |
| GET | /users/me | 要 | プロフィール取得 |
| PUT | /users/me | 要 | プロフィール更新 |
| POST | /users/me/avatar | 要 | アイコンアップロード（Supabase Storage、JPEG/PNG最大2MB） |
