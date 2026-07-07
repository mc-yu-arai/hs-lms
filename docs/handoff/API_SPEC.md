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
| GET | /v1/users | 要・admin/super_admin限定 | 全ユーザー一覧取得。`keyword`(メールの部分一致)/`role`/`isActive`でフィルタ可 |
| PUT | /v1/users/:id | 要・admin/super_admin限定 | 他ユーザーのロール変更・有効化/無効化。**自分自身は対象にできない**（自己ロックアウト防止のため400） |
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
| POST | /v1/courses/:id/certificate | Bearer要 | 修了証発行。コース未修了なら409。既に発行済みなら200で既存レコード、新規発行なら201を返す（`UNIQUE(user_id, course_id)`による冪等） |
| GET | /v1/courses/:id/certificate/download | Bearer要 | 修了証PDFダウンロード。未発行でも修了済みなら自動発行してから生成。`Content-Type: application/pdf` |
| GET | /v1/certificates/:uuid/verify | 不要 | QRコード・共有URLからの検証用。`verification_uuid`で検索し、コース名・受講者氏名・発行日を返す（メールアドレス等は含めない）。見つからなければ404 |
| GET | /v1/reports/users | 要・admin/super_admin限定 | 受講者別進捗一覧（全ユーザー対象。氏名・部署・受講コース数・修了数・平均進捗率） |
| GET | /v1/reports/courses | 要・admin/super_admin限定 | コース別集計（受講者数・修了者数・修了率・平均進捗率） |
| GET | /v1/reports/users/csv | 要・admin/super_admin限定 | 受講者別レポートのCSVダウンロード（BOM付きUTF-8） |
| GET | /v1/reports/courses/csv | 要・admin/super_admin限定 | コース別レポートのCSVダウンロード（BOM付きUTF-8） |
| GET | /v1/admin/notification-settings | 要・admin/super_admin限定 | 通知設定取得。未作成ならデフォルト値（7日前・09:00:00・有効）で自動作成 |
| PUT | /v1/admin/notification-settings | 要・admin/super_admin限定 | 通知設定更新（`reminderDaysBefore`/`autoSendTime`/`isEnabled`、いずれも任意） |
| POST | /v1/admin/notifications/send-reminders | 要・admin/super_admin限定 | 期限切れリマインダーの手動送信実行。`node-cron`による自動実行と同じロジックを呼ぶ |
| GET | /v1/admin/notifications/logs | 要・admin/super_admin限定 | 通知送信履歴一覧（新しい順。学習者氏名・コース名を付与） |
| GET | /v1/groups | 要・admin/super_admin限定 | グループ一覧（メンバー数・割当コース数を含む） |
| POST | /v1/groups | 要・admin/super_admin限定 | グループ新規作成（`name`必須・`description`任意） |
| GET | /v1/groups/:id | 要・admin/super_admin限定 | グループ詳細（メンバー一覧・割当コース一覧を含む） |
| PUT | /v1/groups/:id | 要・admin/super_admin限定 | グループ更新（`name`/`description`、いずれも任意） |
| DELETE | /v1/groups/:id | 要・admin/super_admin限定 | グループ削除。`group_members`/`group_courses`はON DELETE CASCADEで削除されるが、既存の`enrollments`には影響しない |
| POST | /v1/groups/:id/members | 要・admin/super_admin限定 | メンバー追加（`userId`必須）。既に所属済みなら冪等に既存行を返す。そのグループに割当済みのコースがあれば、対象ユーザーに未登録のもののみ受講登録を自動作成（`enrollment_completed`通知も発火） |
| DELETE | /v1/groups/:id/members | 要・admin/super_admin限定 | メンバー削除（`userId`必須）。グループとの紐付けのみ解除し、既存の`enrollments`（進捗含む）は削除しない |
| POST | /v1/groups/:id/courses | 要・admin/super_admin限定 | コース割り当て（`courseId`必須）。既に割当済みなら冪等に既存行を返す。現在のグループメンバー全員のうち、そのコースに未登録のユーザーのみ受講登録を自動作成（`enrollment_completed`通知も発火） |
| DELETE | /v1/groups/:id/courses | 要・admin/super_admin限定 | コース割り当て解除（`courseId`必須）。グループとの紐付けのみ解除し、既存の`enrollments`（進捗含む）は削除しない |
| GET | /v1/reports/groups/:id | 要・admin/super_admin限定 | グループ別進捗レポート（メンバーごとの受講コース数・修了数・平均進捗率、グループ全体の平均修了率）。グループが存在しなければ404 |
| GET | /v1/reports/groups/:id/csv | 要・admin/super_admin限定 | グループ別レポートのCSVダウンロード（BOM付きUTF-8） |

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
主なエラーコード: `validation_error`(400) / `invalid_credentials`(401) / `account_disabled`(403) / `account_locked`(423) / `invalid_pending_token`(401) / `invalid_totp_code`(401) / `unauthorized`(401) / `forbidden`(403) / `invalid_file`/`invalid_file_type`(400/413) / `email_change_failed`(400) / `password_update_failed`(400) / `course_not_found`(404) / `course_has_enrollments`(409) / `not_enrolled`(404) / `prerequisite_not_completed`(409) / `quiz_not_found`(404) / `self_modification_forbidden`(400) / `user_not_found`(404) / `course_not_completed`(409) / `too_many_requests`(429)

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

**GET /v1/users**（admin/super_admin）
```json
{ "users": [ { "id": "...", "email": "...", "lastName": "...", "firstName": "...", "role": "learner",
  "department": "営業部", "isActive": true, ... } ] }
```

**PUT /v1/users/:id**（admin/super_admin）
```json
// request（フィールドは任意）
{ "role": "admin", "isActive": false }
// response
{ "user": { ... } }
// 自分自身のidを指定した場合 -> 400 { "error": { "code": "self_modification_forbidden", ... } }
```

**POST /v1/courses/:id/certificate**
```json
// -> 201（新規）または200（既存） { "certificate": { "id": "...", "courseId": "...", "issuedAt": "...", "verificationUuid": "..." } }
// 未修了 -> 409 { "error": { "code": "course_not_completed", ... } }
```

**GET /v1/courses/:id/certificate/download**
`Content-Type: application/pdf`、`Content-Disposition: attachment; filename="certificate.pdf"`でPDFバイナリを返す。未修了なら409。

**GET /v1/certificates/:uuid/verify**
```json
// 有効 -> 200 { "valid": true, "certificate": { "courseTitle": "...", "learnerName": "山田 太郎", "issuedAt": "..." } }
// 無効・存在しない -> 404 { "valid": false }
```

**GET /v1/reports/users**（admin/super_admin）
```json
{ "users": [ { "userId": "...", "lastName": "鈴木", "firstName": "花子", "department": "営業部",
  "courseCount": 3, "completedCount": 2, "averageProgressRate": 75.5 } ] }
```
全ユーザー（roleを問わない）が対象。`averageProgressRate`はそのユーザーの全enrollmentの`progress_rate`単純平均（enrollmentが無ければ0）。

**GET /v1/reports/courses**（admin/super_admin）
```json
{ "courses": [ { "courseId": "...", "title": "新人研修", "enrolledCount": 10, "completedCount": 6,
  "completionRate": 60, "averageProgressRate": 72.3 } ] }
```

**GET /v1/reports/users/csv**, **GET /v1/reports/courses/csv**
`Content-Type: text/csv; charset=utf-8`（BOM付き）、`Content-Disposition: attachment`。列構成は上記JSONと同じ項目（氏名は姓名を結合）。

**GET /v1/admin/notification-settings**（admin/super_admin）
```json
{ "settings": { "reminderDaysBefore": 7, "autoSendTime": "09:00:00", "isEnabled": true, "updatedAt": "..." } }
```

**PUT /v1/admin/notification-settings**（admin/super_admin）
```json
// request（フィールドは任意。autoSendTimeはHH:MMまたはHH:MM:SS形式）
{ "reminderDaysBefore": 3, "autoSendTime": "18:30", "isEnabled": true }
// response
{ "settings": { ... } }
```

**POST /v1/admin/notifications/send-reminders**（admin/super_admin）
```json
{ "result": { "sent": 2, "skipped": 5, "failed": 0 } }
```
`skipped`は「期限切れ済み修了」「期限日が対象期間外」「同じ受講登録に対して過去に送信成功済み」のいずれか。

**GET /v1/admin/notifications/logs**（admin/super_admin）
```json
{ "logs": [ { "id": "...", "learnerName": "山田 太郎", "courseTitle": "新人研修",
  "notificationType": "course_completed", "isSuccess": true, "errorMessage": null, "sentAt": "..." } ] }
```
`notificationType`は`enrollment_completed` / `course_completed` / `due_date_reminder`のいずれか。

**GET /v1/groups**（admin/super_admin）
```json
{ "groups": [ { "id": "...", "name": "営業チーム", "description": "...", "createdAt": "...", "updatedAt": "...",
  "memberCount": 5, "courseCount": 2 } ] }
```

**GET /v1/groups/:id**（admin/super_admin）
```json
{ "group": { "id": "...", "name": "営業チーム", "description": "...", "createdAt": "...", "updatedAt": "..." },
  "members": [ { "id": "...", "addedAt": "...",
    "user": { "id": "...", "lastName": "山田", "firstName": "太郎", "email": "...", "department": "営業部" } } ],
  "courses": [ { "id": "...", "assignedAt": "...",
    "course": { "id": "...", "title": "新人研修", "level": "beginner", "isPublished": true } } ] }
```

**POST /v1/groups/:id/members**（admin/super_admin）
```json
// request
{ "userId": "..." }
// -> 201 { "member": { "id": "...", "addedAt": "...", "userId": "..." } }
```

**POST /v1/groups/:id/courses**（admin/super_admin）
```json
// request
{ "courseId": "..." }
// -> 201 { "groupCourse": { "id": "...", "assignedAt": "...", "courseId": "..." } }
```

**GET /v1/reports/groups/:id**（admin/super_admin）
```json
{ "report": { "groupId": "...", "groupName": "営業チーム", "memberCount": 5, "averageCompletionRate": 62.5,
  "members": [ { "userId": "...", "lastName": "山田", "firstName": "太郎", "department": "営業部",
    "courseCount": 3, "completedCount": 2, "averageProgressRate": 75.5 } ] } }
```
`averageCompletionRate`はメンバーごとの「修了数/受講コース数」を単純平均したもの（受講コース数0のメンバーは0%として算入）。グループが存在しなければ404。

**GET /v1/reports/groups/:id/csv**（admin/super_admin）
`Content-Type: text/csv; charset=utf-8`（BOM付き）。列構成は`GET /v1/reports/users/csv`と同じ（対象をグループメンバーに限定）。

## 未実装（別ブロック扱い）
- 7.2.4のレポート系の一部（`/reports/mandatory`の必須研修進捗、`/reports/dashboard`のダッシュボード専用集計、`/reports/export`のExcel等CSV以外の出力）。受講者別・コース別・グループ別の基本集計とCSV出力は`GET/POST /reports/*`として実装済み
- ユーザーの新規作成・削除・CSVインポート（7.2.2）。一覧取得・ロール変更・有効化無効化は`GET/PUT /users`として実装済み（管理者向けフロントエンドブロック）
