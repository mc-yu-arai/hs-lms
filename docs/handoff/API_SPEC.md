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
| GET | /v1/users/me/enrollments | Bearer要 | 自分の受講中コース一覧（進捗率・ステータス・コース基本情報を含む）。仕様書7.2.3には無いが、ダッシュボードの「受講中コース一覧」表示のために追加（コース管理ブロックの拡張） |
| POST | /v1/auth/password/reset | 不要 | パスワードリセットメール送信（Resend経由）。メール存在有無を漏らさず常に同一レスポンス |
| PUT | /v1/auth/password/update | リセットトークン(`token`)要 | リセットメール内リンクのアクセストークンでパスワード更新。ポリシー（8文字以上・英数字記号混在）を検証 |
| GET | /v1/courses | Bearer要 | コース一覧。learnerは`isPublished:true`のみ、admin/super_adminは全件。`keyword`/`categoryId`/`level`でフィルタ可 |
| GET | /v1/courses/:id | Bearer要 | コース詳細＋章/レッスン構成。未受講者にはlessonの`contentUrl`/`contentBody`を隠す |
| POST | /v1/courses | 要・admin/super_admin限定 | コース作成。`chapters`配列をネストで受け取り章・レッスンも同時作成 |
| PUT | /v1/courses/:id | 要・admin/super_admin限定 | コース更新。`chapters`を指定すると章・レッスンを全置換 |
| DELETE | /v1/courses/:id | 要・admin/super_admin限定 | コース削除。受講履歴(enrollments)が1件でもあれば409で拒否 |
| POST | /v1/courses/:id/enroll | Bearer要 | 受講登録。前提コース(`prerequisiteCourseId`)が未修了なら409。既に受講済みなら200で既存レコードを返す（冪等） |
| GET | /v1/courses/:id/progress | Bearer要 | 自分の受講進捗（enrollment＋レッスン単位の進捗一覧）。未受講なら404 |
| PUT | /v1/courses/:id/lessons/:lessonId/progress | Bearer要 | レッスン進捗更新。video系は80%以上で自動完了、それ以外は`completed:true`を明示。enrollmentの進捗率・ステータスを再計算（テストが存在するコースは合格済み受験履歴も無いと`completed`にならない） |
| GET | /v1/courses/:id/quiz | Bearer要 | コースの修了テスト取得（設問・選択肢）。学習者は要受講登録、admin/super_adminは受講登録不要。学習者には`isCorrect`を隠す |
| POST | /v1/courses/:id/quiz | 要・admin/super_admin限定 | テスト作成・全置換（`questions`配列をネストで受け取る。1コース1テスト）。既存の受験履歴(quiz_attempts)は設問のON DELETE CASCADEで一緒に削除される点に注意 |
| POST | /v1/courses/:id/quiz/attempts | Bearer要 | 回答送信・採点。設問ごとに選択肢集合が完全一致すれば正解、`(正解数/設問数)×100`が得点。`score >= courses.pass_score`で合格。無制限に再受験可。enrollmentの完了判定も同時に再計算 |
| GET | /v1/courses/:id/quiz/attempts | Bearer要 | 自分の受験履歴一覧（得点・合否・受験日時、新しい順） |

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

**GET /v1/users/me/enrollments**
```json
{ "enrollments": [
  { "id": "...", "status": "in_progress", "progressRate": 42.5, "totalStudyTime": 1200,
    "startedAt": "...", "completedAt": null, "dueDate": null,
    "course": { "id": "...", "title": "新人研修", "level": "beginner",
      "durationMinutes": 90, "isMandatory": true, "thumbnailUrl": null } }
] }
```
`started_at`降順。コースが削除済みの場合はそのenrollmentを結果から除外する。

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

**GET /v1/courses/:id**
```json
{ "course": { "id": "...", "title": "...", "level": "beginner", "isPublished": true,
  "thumbnailUrl": null, "prerequisiteCourseId": null, ... },
  "chapters": [ { "id": "...", "title": "第1章", "displayOrder": 0,
    "lessons": [ { "id": "...", "title": "...", "contentType": "video",
      "durationSeconds": 300, "contentUrl": null, "contentBody": null } ] } ],
  "enrolled": false }
```
`contentUrl`/`contentBody`は未受講かつ非admin/super_adminの場合`null`になる。

**POST /v1/courses**（admin/super_admin）
```json
{ "title": "新人研修", "level": "beginner", "passScore": 70,
  "chapters": [ { "title": "第1章", "lessons": [
    { "title": "動画を見る", "contentType": "video", "contentUrl": "...", "durationSeconds": 600 } ] } ] }
```

**POST /v1/courses/:id/enroll**
```json
// -> 201 { "enrollment": { "id": "...", "status": "in_progress", "progressRate": 0, ... } }
// 前提コース未修了時 -> 409 { "error": { "code": "prerequisite_not_completed", ... } }
```

**PUT /v1/courses/:id/lessons/:lessonId/progress**
```json
// request（フィールドは全て任意。videoは進捗%、text/pdfはcompleted:trueで完了扱い）
{ "progressPercent": 85, "lastPositionSeconds": 240, "studyTimeDeltaSeconds": 300 }
// response
{ "enrollment": { "id": "...", "status": "completed", "progressRate": 100, "totalStudyTime": 300, "completedAt": "..." } }
```

**エラーレスポンス共通形式**
```json
{ "error": { "code": "invalid_credentials", "message": "..." } }
```
主なエラーコード: `validation_error`(400) / `invalid_credentials`(401) / `account_disabled`(403) / `account_locked`(423) / `invalid_pending_token`(401) / `invalid_totp_code`(401) / `unauthorized`(401) / `forbidden`(403) / `invalid_file`/`invalid_file_type`(400/413) / `email_change_failed`(400) / `password_update_failed`(400) / `course_not_found`(404) / `course_has_enrollments`(409) / `not_enrolled`(404) / `prerequisite_not_completed`(409) / `quiz_not_found`(404) / `too_many_requests`(429)

**GET /v1/courses/:id/quiz**
```json
{ "quiz": { "id": "...", "title": "修了確認テスト", "description": "...", "passScore": 70 },
  "questions": [
    { "id": "...", "questionText": "...", "questionType": "single_choice", "displayOrder": 0,
      "choices": [ { "id": "...", "choiceText": "...", "displayOrder": 0 } ] }
  ] }
```
学習者向けレスポンスには各choiceの`isCorrect`フィールドが存在しない（admin/super_adminのみ含まれる）。

**POST /v1/courses/:id/quiz**（admin/super_admin）
```json
{ "title": "修了確認テスト", "questions": [
  { "questionText": "...", "questionType": "single_choice",
    "choices": [ { "choiceText": "A", "isCorrect": true }, { "choiceText": "B", "isCorrect": false } ] } ] }
```
`single_choice`は正解choiceがちょうど1つ、`multiple_choice`は1つ以上必要（バリデーションエラーは400）。

**POST /v1/courses/:id/quiz/attempts**
```json
// request
{ "answers": [ { "questionId": "...", "choiceIds": ["...", "..."] } ] }
// response
{ "attempt": { "id": "...", "score": 100, "isPassed": true, "submittedAt": "..." },
  "questionResults": [ { "questionId": "...", "isCorrect": true, "correctChoiceIds": ["..."], "selectedChoiceIds": ["..."] } ],
  "enrollment": { "id": "...", "status": "completed", "progressRate": 100, "completedAt": "..." } }
```

**GET /v1/courses/:id/quiz/attempts**
```json
{ "attempts": [ { "id": "...", "score": 100, "isPassed": true, "submittedAt": "..." } ] }
```

## 未実装（別ブロック扱い）
- 修了証発行（3.2.4。テスト合格が前提のためテスト機能ブロック後）
- レポートAPI（7.2.4: `/reports/progress`, `/reports/mandatory`, `/reports/export`, `/reports/dashboard`）
- グループ管理（4.2.2）・通知/アラート機能（4.4.2）
- ユーザー管理API（7.2.2の`/users`一覧・作成・更新・削除・CSVインポート。認証ブロックでは`/users/me`系のみ実装済み）
