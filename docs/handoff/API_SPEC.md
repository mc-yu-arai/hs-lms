# API_SPEC

ベースパス: `/v1`（`backend/src/app.ts`）

## 実装済み

| メソッド | パス | 認証要否 | 概要 |
|---|---|---|---|
| GET | /health | 不要 | 死活監視 |
| POST | /v1/auth/login | 不要 | メール・パスワードログイン。admin/super_adminかつtotp_enabledの場合は`requiresTwoFactor:true`と`pendingToken`を返し、実トークンは返さない |
| POST | /v1/auth/login/2fa | 仮トークン(`pendingToken`)要 | TOTPコード検証。成功時に本来の`accessToken`/`refreshToken`を返す |
| POST | /v1/auth/logout | Bearer要 | Supabase Admin APIでアクセストークンを無効化（`scope: global`） |
| POST | /v1/auth/refresh | リフレッシュトークン要 | Supabaseの`refreshSession`をラップ。アカウント無効時は403 |
| GET | /v1/auth/oauth/google | 不要 | Supabase Auth標準のGoogle Providerへリダイレクト開始（PKCE） |
| GET | /v1/auth/oauth/google/callback | 不要 | Googleからのコールバック。未登録メールは拒否、admin+2FA有効の場合は`/auth/login/2fa`同様のpendingTokenフローへ |
| POST | /v1/auth/2fa/setup | 要・admin/super_admin限定 | TOTPシークレット発行・QRコード（この時点ではtotp_enabledはfalseのまま） |
| POST | /v1/auth/2fa/verify | 要・admin/super_admin限定 | 初回TOTP検証。成功でtotp_enabled=trueに |
| GET | /v1/users/me | Bearer要 | プロフィール取得（avatarUrl含む） |
| PUT | /v1/users/me | Bearer要 | プロフィール更新。email変更時は即時反映せず確認メール送信のみ |
| POST | /v1/users/me/avatar | Bearer要 | アイコン画像アップロード（JPEG/PNG、最大2MB、Supabase Storage） |
| POST | /v1/auth/password/reset | 不要 | パスワードリセットメール送信（Resend経由）。メール存在有無を漏らさず常に同一レスポンス |
| PUT | /v1/auth/password/update | リセットトークン(`token`)要 | リセットメール内リンクのアクセストークンでパスワード更新。ポリシー（8文字以上・英数字記号混在）を検証 |

### リクエスト/レスポンス例

**POST /v1/auth/login**
```json
// request
{ "email": "user@example.com", "password": "P@ssw0rd1" }
// response (2FA不要)
{ "requiresTwoFactor": false, "accessToken": "...", "refreshToken": "...", "expiresIn": 3600,
  "user": { "id": "...", "email": "...", "lastName": "...", "firstName": "...", "role": "learner" } }
// response (admin+2FA必須)
{ "requiresTwoFactor": true, "pendingToken": "..." }
```

**POST /v1/auth/login/2fa**
```json
{ "pendingToken": "...", "code": "123456" }
// -> { "accessToken": "...", "refreshToken": "...", "user": { ... } }
```

**GET /v1/auth/oauth/google/callback（ブラウザリダイレクト）**
- 成功（2FA不要）: `302 -> {FRONTEND_URL}/auth/callback#access_token=...&refresh_token=...&expires_in=...`
- 成功（admin+2FA要）: `302 -> {FRONTEND_URL}/auth/2fa?pendingToken=...`
- 失敗（未登録・無効化・検証失敗）: `302 -> {FRONTEND_URL}/login?error=...`

**POST /v1/auth/2fa/setup**
```json
// -> { "secret": "BASE32SECRET", "otpauthUrl": "otpauth://totp/...", "qrCodeDataUrl": "data:image/png;base64,..." }
```

**GET /v1/users/me**
```json
{ "user": { "id": "...", "email": "...", "lastName": "...", "firstName": "...", "role": "admin",
  "department": "...", "hireDate": null, "isActive": true, "lastLoginAt": "...",
  "totpEnabled": true, "avatarUrl": "https://.../avatars/<id>/avatar.png" } }
```

**PUT /v1/users/me**
```json
// request（全フィールド任意）
{ "lastName": "鈴木", "department": "人事部", "email": "new@example.com" }
// response
{ "user": { ... }, "emailChangeRequested": true }
```
`emailChangeRequested: true` の場合、`public.users.email`はまだ更新されていない（Supabase Authからの確認メールをクリックするまで反映されない）。

**POST /v1/users/me/avatar**
`multipart/form-data`、フィールド名 `avatar`。レスポンス: `{ "avatarUrl": "https://.../avatars/<id>/avatar.png" }`

**POST /v1/auth/password/reset**
```json
// request
{ "email": "user@example.com" }
// response（常に同じメッセージ。該当ユーザーが存在してactiveな場合のみ実際にメール送信）
{ "message": "ご入力のメールアドレス宛にパスワード再設定のご案内を送信しました（該当するアカウントが存在する場合）" }
```

**PUT /v1/auth/password/update**
```json
// request（tokenはリセットメール内リンク＝Supabase recovery action_linkから得られるアクセストークン）
{ "token": "...", "newPassword": "NewPassw0rd!" }
// response
{ "message": "パスワードを更新しました" }
```

**エラーレスポンス共通形式**
```json
{ "error": { "code": "invalid_credentials", "message": "..." } }
```
主なエラーコード: `validation_error`(400) / `invalid_credentials`(401) / `account_disabled`(403) / `account_locked`(423) / `invalid_pending_token`(401) / `invalid_totp_code`(401) / `unauthorized`(401) / `forbidden`(403) / `invalid_file`/`invalid_file_type`(400/413) / `email_change_failed`(400) / `password_update_failed`(400) / `too_many_requests`(429)

## 未実装
指示書記載のエンドポイントはすべて実装済み。
