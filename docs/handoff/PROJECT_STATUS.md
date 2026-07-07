# PROJECT_STATUS

## プロジェクト概要
派遣会社向け学習管理システム「HS-LMS」。**認証・アカウント管理ブロック、コース管理ブロック、テスト機能ブロック、修了証発行ブロック、レポートブロック、通知・リマインダーブロックのAPI実装が完了**。フロントエンド（Next.js、`frontend/`）は認証系（ログイン・2FA・パスワードリセット・プロフィール編集）、コース受講系（コース詳細・レッスン視聴・コース完了）、テスト機能系（テスト受験・結果表示）、管理者向け画面（コース管理・テスト管理・ユーザー管理・レポート・**通知**）、修了証系（プレビュー・PDFダウンロード・QR検証ページ）の全21画面を実装済み。

## 技術スタック（確定）
- フロントエンド: Next.js（TypeScript）→ Vercel（未着手）
- バックエンドAPI: Node.js + Express（TypeScript）→ Render（`backend/`）
- データベース: PostgreSQL（Supabase）
- 認証基盤: Supabase Auth（`auth.users`）＋ アプリ用 `public.users`。ロール等のカスタムクレームはSupabase Auth Hookではなく、バックエンド側で `public.users.role` を都度参照する方式（Supabase固有機能への依存を避けるため）
- メール送信: Resend（実キー設定済み。パスワードリセットメールで利用中）
- ストレージ: Supabase Storage（アイコン画像、未実装）

## セッション／トークン管理方針（重要な設計判断）
仕様書はRedisでのセッション管理を想定していたが、現構成にRedisはない。ユーザーの意向により：
- **開発・検証環境ではSupabase Authのセッション機構をそのまま利用**（`signInWithPassword` / `signOut` / `refreshSession`）。独自の `refresh_tokens` テーブルは作らない。
- **本番移行時にPostgres管理の独自トークンテーブルへ移行予定。** 移行時は `backend/src/routes/auth.ts` の `/refresh` `/logout` 実装を差し替える想定（Supabase呼び出し箇所はこの1ファイルに集約してあるので影響範囲は限定的）。

## 完了済み機能
- [x] `public.users` テーブルのマイグレーション作成（未適用、要Supabase側で実行）
- [x] バックエンドプロジェクト雛形（Express + TypeScript、`backend/`）
- [x] `POST /v1/auth/login`（ロックアウト判定、Supabase Auth検証、失敗カウント、admin/super_adminの2FAゲート）
- [x] `POST /v1/auth/login/2fa`（仮トークン検証＋TOTP検証、暗号化保持していたSupabaseセッションを返却）
- [x] `POST /v1/auth/logout`（Supabase Admin APIでトークン無効化）
- [x] `POST /v1/auth/refresh`（Supabaseのリフレッシュセッションをラップ）
- [x] `GET /v1/auth/oauth/google`, `GET /v1/auth/oauth/google/callback`（Supabase Auth標準Google Provider、PKCEフロー。**未登録メールでの自己サインアップは拒否**する設計）
- [x] `POST /v1/auth/2fa/setup`, `POST /v1/auth/2fa/verify`（TOTPシークレット発行・QRコード・admin/super_admin限定）
- [x] `GET /v1/users/me`, `PUT /v1/users/me`, `POST /v1/users/me/avatar`（プロフィール取得・更新、メール変更は確認メール方式、アバターはSupabase Storage）
- [x] `POST /v1/auth/password/reset`, `PUT /v1/auth/password/update`（Supabase Admin `generateLink(recovery)` でリンク発行、Resendで送信。更新はGoTrue REST APIを利用。パスワードポリシー（8文字以上・英数字記号混在）を`PUT /auth/password/update`側でも検証）
- [x] ルート `.gitignore` 作成（`.env` が未追跡だったが `.gitignore` 自体が存在せず、コミットされる恐れがあったため追加）。個人メモ`memo/`も機密情報(DBパスワード)を含むため除外
- [x] Jest統合テスト36件（全てパス）

**指示書（`docs/prompts/01_認証ブロック_ClaudeCode指示プロンプト.md`）記載の全13エンドポイントの実装が完了。**

- [x] コース管理ブロック: `categories`/`courses`/`chapters`/`lessons`/`enrollments`/`lesson_progress`のマイグレーション作成・適用済み
- [x] コース管理ブロック: 仕様書7.2.3記載の8エンドポイント（`GET/POST/PUT/DELETE /courses`系、`enroll`、`progress`系）を実装
- [x] コース管理ブロック: Jestテスト14件追加（フェイクDBによる統合テスト、全てパス）

- [x] フロントエンド: Next.js 16 + TypeScript + Tailwind v4（App Router）で`frontend/`を作成
- [x] フロントエンド: ログイン画面（メール・パスワード、Googleログインボタン、`?error=`クエリの表示）
- [x] フロントエンド: 2FA認証画面（`pendingToken`をクエリから受け取りTOTPコード検証）
- [x] フロントエンド: OAuthコールバック画面（`/auth/callback`。URLフラグメントからトークンを取得）
- [x] フロントエンド: ダッシュボード画面（プロフィール表示＋コースカタログ。保護ルート化、非ログイン時は`/login`へリダイレクト）
- [x] フロントエンド: 認証状態管理基盤（`AuthProvider`。localStorage永続化、401時の自動リフレッシュ、非操作30分の自動ログアウト）
- [x] 実ブラウザ（プレビュー環境）でログイン→ダッシュボード、admin+2FA→ダッシュボード、ログアウト、未ログイン時のリダイレクトを一通り確認済み
- [x] `GET /v1/users/me/enrollments`（自分の受講中コース一覧。進捗率・ステータス・コース基本情報を含む。仕様書7.2.3には無いエンドポイントだがダッシュボード用に追加）。テスト4件追加（合計55件、全てパス）
- [x] フロントエンド: ダッシュボードに「受講中コース一覧」セクションを追加し上記APIに接続（進捗バー・ステータスバッジ表示）。コース作成→受講登録→進捗更新の実データで通しの動作確認済み
- [x] フロントエンド: `/forgot-password`（パスワードリセット申請）、`/reset-password`（リセットリンク遷移先、URLフラグメントのaccess_tokenでパスワード更新）、`/profile`（氏名・部署編集、アイコン画像アップロード）を実装
- [x] フロントエンド: `authFetch`共通化に伴い`api.ts`をFormData対応、`AuthProvider`に`refreshUser`（プロフィール更新後にキャッシュ済みuser情報を再取得）を追加
- [x] 実際のSupabase recoveryリンクを生成してリダイレクト先の`access_token`を取得し、`/reset-password`→新パスワードでのログインまで実データで通しの動作確認済み。プロフィール編集（部署変更→保存→ダッシュボード反映）、アバターアップロード導線も確認済み
- [x] フロントエンド: コース受講画面3つを実装
  - `/courses/[id]`（コース詳細。概要・カリキュラム表示・受講登録ボタン。未受講者にはレッスンへのリンクを出さない）
  - `/courses/[id]/lessons/[lessonId]`（レッスン視聴。動画はMP4直接再生＋視聴位置の自動保存/自動完了(80%以上)、PDFはブラウザ標準の`<iframe>`表示、テキストはスクロール最下部検出＋手動完了ボタンの併用。前後レッスンへのナビゲーション付き）
  - `/courses/[id]/complete`（コース修了メッセージ、ダッシュボードへの導線）
  - ダッシュボードのコースカード（カタログ・受講中一覧とも）を`/courses/[id]`へのリンクに変更
- [x] 実データ（動画・PDF・テキストの3レッスンからなるテストコースを新規作成）で、受講登録→動画視聴（自動進捗保存・自動完了）→PDF閲覧（手動完了）→テキスト閲覧（手動完了）→コース修了画面への自動遷移→ダッシュボードでの反映まで、通しでブラウザ動作確認済み
- [x] 動作確認中に発見したバグを修正: `POST /auth/login`・`POST /auth/login/2fa`のレスポンスの`user`オブジェクトが、`department`/`hireDate`/`isActive`/`lastLoginAt`/`totpEnabled`/`avatarUrl`を含まない簡略版だった（`GET /users/me`が返す形と不一致）。ログイン直後のダッシュボードで「所属: 未設定」のように古い/欠落した情報が出ていた。`routes/auth.ts`の独自`publicUser()`を削除し、`userRepository.ts`の`toPublicProfile()`に統一。テストに回帰確認を追加、55件全てパス
- [x] テスト機能ブロック: `quizzes`/`questions`/`choices`/`quiz_attempts`/`quiz_answers`のマイグレーション作成・適用済み（「1コース=1テスト」設計。合格点は`courses.pass_score`を流用）
- [x] テスト機能ブロック: `GET/POST /courses/:id/quiz`（テスト取得・admin向け作成）、`POST /courses/:id/quiz/attempts`（回答送信・採点）、`GET /courses/:id/quiz/attempts`（受験履歴取得）を実装（`backend/src/services/quizRepository.ts`, `backend/src/routes/courses.ts`）。単一選択/複数選択とも選択肢集合の完全一致で正誤判定、無制限再受験に対応
- [x] テスト機能ブロック: `courseRepository.ts`の`recalculateEnrollmentProgress`を拡張し、コース完了判定を「全レッスン完了 かつ（テストが無い、またはテスト合格済み）」に変更。呼び出し元（レッスン進捗更新API・テスト回答送信API）双方で判定フラグを算出
- [x] テスト機能ブロック: Jestテスト8件追加（採点ロジック・admin限定・合否・完了判定への影響、合計63件全てパス）
- [x] テスト機能ブロック フロントエンド: `/courses/[id]/quiz`（テスト受験画面。単一選択=ラジオボタン、複数選択=チェックボックス、未回答チェック）、`/courses/[id]/quiz/result`（結果画面。設問ごとの正誤内訳、受験履歴一覧、再受験導線）を実装。コース詳細画面にテストの有無を検出して「修了テストを受ける」導線を追加
- [x] テスト機能ブロック: 実データ（管理者としてAPI経由でテスト付きコースを新規作成し、学習者としてブラウザで受講登録→レッスン完了→テスト合格→コース自動修了→ダッシュボード反映、および誤答での再受験が履歴に残り修了状態は維持されることまで）を通しで確認済み
- [x] 管理者向けフロントエンド: `GET /v1/users`（一覧、`keyword`/`role`/`isActive`でフィルタ可）、`PUT /v1/users/:id`（ロール変更・有効化無効化。**自分自身は対象にできない**、自己ロックアウト防止のため`self_modification_forbidden`で400）を`userRepository.ts`/`routes/users.ts`に追加。コース管理・テスト管理は既存API（`POST/PUT /courses`の`chapters`全置換、`POST /courses/:id/quiz`の`questions`全置換）をそのまま活用し新規API追加なし。Jestテスト7件追加（合計70件全てパス）
- [x] 管理者向けフロントエンド: `useRequireAdmin`フック（admin/super_admin以外はダッシュボードへリダイレクト）を追加し、以下5画面を実装
  - `/admin/courses`（コース一覧。新規作成導線・編集/テスト管理へのリンク・公開非公開切替・削除）
  - `/admin/courses/new`, `/admin/courses/[id]/edit`（`CourseForm`共通コンポーネント。章・レッスンの追加/削除/並び替えをローカルstateで編集し、保存時に配列順で`display_order`が決まる既存API仕様にそのまま送信）
  - `/admin/courses/[id]/quiz`（設問・選択肢の追加/削除、単一選択は正解を1つに自動制限、保存で全置換）
  - `/admin/users`（一覧・ロール変更（インライン select）・有効化無効化（インライン button）。自分自身の行は操作不可として表示）
  - ダッシュボードのヘッダーにadmin/super_admin限定で「管理者メニュー」リンクを追加
- [x] 管理者向けフロントエンド: 実データで動作確認済み（学習者アカウントで`/admin/courses`に直接アクセス→ダッシュボードへリダイレクトされることを確認。管理者アカウントでコース新規作成（章・レッスン付き）→編集画面への自動遷移→内容がプリフィルされていることを確認→修了テスト作成→保存成功→ユーザー管理画面でロール変更・有効化無効化の反映とロールバック→コース削除、まで一通り確認）
- [x] 修了証発行ブロック: `certificates`テーブル（`id`と`verification_uuid`を分離、`UNIQUE(user_id, course_id)`で冪等性担保）のマイグレーション作成・適用済み
- [x] 修了証発行ブロック: `POST /v1/courses/:id/certificate`（発行。修了済みのみ、既存なら200・新規なら201）、`GET /v1/courses/:id/certificate/download`（PDFダウンロード）、`GET /v1/certificates/:uuid/verify`（認証不要のQR検証用）を実装。`backend/src/services/certificateRepository.ts`・`certificatePdfService.ts`・`routes/certificates.ts`を新規作成
- [x] 修了証発行ブロック: PDF生成は`pdfkit`を採用（`puppeteer`はデプロイ先RenderのNode標準buildpackにCJKフォントが無く別途対応が必要になるため）。日本語表示用に**Noto Sans JP（OFLライセンス、可変フォント）を`backend/assets/fonts/NotoSansJP-Variable.ttf`にバンドル**（約9.6MB）。QRコードは`qrcode`ライブラリで生成しPDFに埋め込み
- [x] 修了証発行ブロック: Jestテスト8件追加（未修了時のエラー・発行の冪等性・PDFストリーミング・検証エンドポイント、合計78件全てパス）
- [x] 修了証発行ブロック フロントエンド: `/courses/[id]/certificate`（プレビュー画面。学習者氏名・コース名・発行日・QRコード<qrcodeライブラリでクライアント側生成>を表示、PDFダウンロードボタン、検証ページへのリンク）、`/certificates/[uuid]`（認証不要の公開QR検証ページ）を実装。コース完了画面とダッシュボードの受講中コース一覧（修了済みのみ）に「修了証を見る」導線を追加
- [x] 修了証発行ブロック: `frontend/src/lib/api.ts`に`apiFetchBlob`、`auth-context.tsx`に`authFetchBlob`を追加（PDFなどバイナリレスポンスをJSONと同じ401自動リフレッシュの仕組みでダウンロードするための拡張）
- [x] 修了証発行ブロック: 実データで動作確認済み（修了済みコースから修了証発行→プレビュー表示→PDFダウンロード成功→QR検証ページで受講者名・コース名・発行日を確認→無効なUUIDでは「確認できませんでした」表示→再訪問時は200 OKで同一の`verificationUuid`が返る冪等性を確認）
- [x] レポートブロック: `GET /v1/reports/users`（受講者別: 氏名・部署・受講コース数・修了数・平均進捗率）、`GET /v1/reports/courses`（コース別: 受講者数・修了者数・修了率・平均進捗率）、`GET /v1/reports/users/csv`・`GET /v1/reports/courses/csv`（同内容のCSVダウンロード、BOM付きUTF-8でExcelでの文字化けを回避）を実装（`backend/src/services/reportRepository.ts`, `routes/reports.ts`。DBマイグレーション不要、既存の`users`/`courses`/`enrollments`を集計するのみ）
- [x] レポートブロック: Jestテスト7件追加（admin限定・集計ロジック（複数ユーザー/コースでの平均計算・未受講時の0埋め）・CSVのBOMとヘッダー行、合計85件全てパス）
- [x] レポートブロック フロントエンド: `/admin/reports`（受講者別・コース別の2タブ構成。各タブにサマリーカード3枚＋詳細テーブル＋CSVダウンロードボタン）を実装。`AdminHeader`のナビゲーションに「レポート」リンクを追加
- [x] レポートブロック: 実データで動作確認済み（受講者別タブで実際の受講者・修了数・平均進捗率が正しく集計されていることを確認、コース別タブで各コースの受講者数・修了率が正しいことを確認、両タブのCSVダウンロードボタンがそれぞれ`/v1/reports/users/csv`・`/v1/reports/courses/csv`を200 OKで呼び出すことを確認）
- [x] 通知・リマインダーブロック: `notification_settings`（シングルトン運用、リマインダー送信日数・自動送信時刻・有効無効フラグ）、`notification_logs`（送信履歴）のマイグレーション作成・適用済み
- [x] 通知・リマインダーブロック: `GET/PUT /v1/admin/notification-settings`（設定取得更新）、`POST /v1/admin/notifications/send-reminders`（手動送信）、`GET /v1/admin/notifications/logs`（送信履歴。指示のAPI一覧には無かったがフロントエンドの表示に必要なため追加）を実装（`backend/src/services/notificationRepository.ts`, `notificationService.ts`, `routes/notifications.ts`）
- [x] 通知・リマインダーブロック: `node-cron`で毎分チェックし現在時刻が設定の`auto_send_time`と一致した回だけリマインダー送信を実行（`backend/src/lib/notificationCron.ts`、`index.ts`から起動。`createApp()`を使うJestテストには影響しない設計）
- [x] 通知・リマインダーブロック: 既存API（`POST /courses/:id/enroll`、レッスン進捗更新API、テスト回答送信API）に通知フックを追加。受講登録時に`enrollment_completed`、コース完了（未完了→完了に遷移した瞬間のみ、重複送信なし）時に`course_completed`を送信
- [x] 通知・リマインダーブロック: Jestテスト13件追加（設定のシングルトン自動作成・更新・バリデーション、リマインダー送信の対象抽出・重複防止・無効化時のスキップ・送信失敗記録、送信履歴の氏名/コース名付与、イベントフックの発火とその冪等性、合計98件全てパス）
- [x] 通知・リマインダーブロック フロントエンド: `/admin/notifications`（通知設定フォーム、手動送信ボタンと結果表示、送信履歴テーブル）を実装。`AdminHeader`に「通知」リンクを追加
- [x] 通知・リマインダーブロック: 実データで動作確認済み（設定変更→保存確認、手動送信ボタン→対象なしで0件応答を確認、新規コースへの受講登録→`enrollment_completed`ログが送信履歴に記録、レッスン完了によるコース修了→`course_completed`ログが記録、いずれも実際のResend APIを呼び出しており、送信失敗の記録もResendのサンドボックス制限メッセージとして正しくログされることを確認——実害はなく既知の制約）

## 未着手・進行中
- [ ] CSRF対策（現状JWT Bearerのみでcookieを使っていないため優先度は下げているが、フロント実装時にcookie方式を採る場合は要対応）
- [ ] Supabaseのパスワードリカバリーリンクの有効期限設定（ダッシュボード側）が実際に1時間になっているかの確認
- [ ] グループ管理は別ブロックとして未着手（`docs/handoff/API_SPEC.md`参照）
- [ ] プロフィール編集画面（`/profile`）はメールアドレス変更UIを含めていない（バックエンドの`PUT /users/me`はemailフィールドに対応済みだが、今回のスコープ指示に含まれなかったため未実装）
- [ ] ユーザーの新規作成・削除・CSVインポート（7.2.2）は未実装（一覧・ロール変更・有効化無効化のみ実装済み）
- [ ] カテゴリ（`categories`テーブル）の管理UIは未実装。コース作成フォームに`categoryId`の入力欄がなく、常に`null`で作成される

## 外部サービス側で追加設定が必要な項目（要ユーザー作業）
- [ ] Supabaseダッシュボード → Authentication → Providers でGoogle Providerを有効化し、Client ID/Secretを登録
- [ ] Supabaseダッシュボード → Authentication → URL Configuration の Redirect URLs に `http://localhost:3001/v1/auth/oauth/google/callback`（本番URLも later）を追加
- [ ] Supabase Storageに `avatars` という名前の公開バケットを作成（`POST /users/me/avatar` が書き込み先として使用）

## 既知の問題・保留中の判断事項
- 2FA仮トークンは暗号化されたオペーク文字列としてサーバー内で完結させており、DBには保存していない（5分で失効）。ユーザーが2FA未完了のまま放置した場合、内部で保持していたSupabaseセッション自体は生成済みのまま残る（誰にも渡らないため実害は低いが、本番移行時に要再検討）
- Google OAuthは「CSVによる一括インポート（管理者）」で事前に`public.users`に登録済みのメールアドレスのみログインを許可する設計にした（自己サインアップは不可）。運用方針と異なる場合は要相談
- メールアドレス変更（`PUT /users/me`）はSupabase Auth標準の確認メール方式（新アドレス宛にリンク送信）に委ねており、リンククリックで確定した時点で次回認証済みリクエスト時に`public.users.email`を同期する方式（`requireAuth`ミドルウェア内）。確認メールの送信経路自体はSupabaseのデフォルト（Resend経由ではない）のままなので、Resendに統一したい場合はSupabase側のCustom SMTP設定が別途必要
- パスワードリセットのメール送信は自前でResend APIを呼んでいる（`backend/src/lib/resend.ts`）ため、Supabase Auth側のメール送信設定（Custom SMTP）は使っていない。Supabase側のリカバリーリンク有効期限設定（ダッシュボードのAuth設定、デフォルト1時間）と`.env`の`PASSWORD_RESET_EXPIRES_MINUTES`(=60)は独立した設定なので、変更する場合は両方合わせること
- コース管理: `courses`/`enrollments`以外のテーブル（`categories`/`chapters`/`lessons`/`lesson_progress`）は仕様書にDDLが存在せず、ER概要・機能要件から独自設計した（詳細は`docs/handoff/DB_SCHEMA.md`）。設計確認をユーザーに依頼したが応答が得られなかったため、推奨案のまま実装している
- コース作成・更新（`POST/PUT /courses`）で章・レッスンをまとめて登録する際、supabase-jsはクライアント側で複数テーブルにまたがるDBトランザクションを提供しないため、レッスン登録に失敗した場合は作成しかけたコースを削除する形でロールバックを模倣している（本物のトランザクションではない）。将来的にはPostgres関数(RPC)化を検討
- 受講登録（`POST /courses/:id/enroll`）は既に受講済みの場合エラーにせず200で既存のenrollmentを返す冪等設計にした（仕様書に明記なし、UX優先の判断）
- コース完了判定は現状「全レッスン完了」のみで、修了テスト合格は考慮していない（テスト機能が別ブロックのため）
- Resendの`onboarding@resend.dev`送信元はアカウント所有者本人以外にメール送信できない制約がある。本番運用時は独自ドメインをResendで検証し`RESEND_FROM_EMAIL`を変更する必要がある。なお、メール送信失敗時に500エラーがクライアントへ露出するバグは2026-07-01に修正済み（サーバー側でログするのみで、レスポンスは常に同じ成功を返す）
- ~~フロントエンドのダッシュボードは「受講中コース一覧」を表示できていない~~ → `GET /v1/users/me/enrollments`を新規追加し解消済み（仕様書7.2.3には無いエンドポイント。コース管理ブロックの拡張として追加）
- フロントエンド実装中、React 19の新しいESLintルール（`react-hooks/refs`）に対応するため`sessionRef`（useRef）でAuthContextの最新状態を参照する実装を試みたところ、実際に**ページリロード時にコース一覧取得が「ログインが必要です」エラーになる競合状態のバグ**を引き起こした（親コンポーネントのeffectが子コンポーネントのeffectより後に実行されるため、refの同期が間に合わなかった）。refパターンをやめ、`session`state を`useCallback`の依存配列に直接含める設計に修正して解決（`frontend/src/lib/auth-context.tsx`）
- 動作確認のため`test@example.com`のパスワードを`/reset-password`画面経由で`TestPass2!`に変更した（旧: `TestPass1!`）。今後このアカウントで手動確認する際は新パスワードを使うこと
- **運用メモ**: バックエンドを手動で起動する際は必ず`npm run dev`（`tsx watch`）を使うこと。`npx tsx src/index.ts`を直接叩くとファイル変更を自動リロードしないため、コード修正後にAPIが古い挙動のままになる（このセッションで実際に発生し、原因特定に時間を要した）
- ログイン応答の`user`オブジェクトの形が`toPublicProfile()`に統一されたのは2026-07-02。それ以前にlocalStorageへキャッシュされたセッション（`department`等が欠けた古い形）が残っているブラウザでは再ログインするまで反映されない（AuthProviderはマウント時にlocalStorageの内容をそのまま復元するだけで、サーバーに再検証しに行かないため）
- テスト機能: 「1コース=1テスト」で設計した（章単位の小テスト等はスコープ外という理解）。`POST /courses/:id/quiz`はテストを丸ごと全置換する仕様のため、既存の設問を編集する管理画面を将来作る場合は個別更新APIの追加を検討すること
- テスト機能: フロントエンドの結果画面（`/courses/[id]/quiz/result`）は、直前の受験結果（設問ごとの正誤内訳）を`sessionStorage`経由で受け渡している。ブックマークや直接アクセスで開いた場合は`sessionStorage`が空のため、得点・合否のサマリーと受験履歴一覧のみ表示し、設問ごとの正誤内訳は表示しない（バックエンド側で過去の回答内容自体は保存しているが、履歴取得APIは集計結果のみを返す設計にしたため）
- 修了証発行: PDF埋め込み用に`backend/assets/fonts/NotoSansJP-Variable.ttf`（約9.6MB、OFLライセンスの可変フォント）をリポジトリに同梱している。デプロイ時にこのファイルがサーバー側に確実に配置される必要がある（`.gitignore`等で誤って除外しないよう注意）。リポジトリサイズが問題になる場合は、実際に使う文字だけに絞ったサブセットフォントへの差し替えを検討すること
- 修了証発行: `POST /courses/:id/certificate`と`GET /courses/:id/certificate/download`はどちらも「未発行なら発行」のfindOrCreateロジックを内包しているため、フロントエンドが先に`POST`を呼ばなくても`download`だけを呼べば初回発行から可能（プレビュー画面は両方の情報が必要なため両方呼んでいる）
- 修了証発行: 検証エンドポイント（`GET /v1/certificates/:uuid/verify`）およびQR検証ページ（`/certificates/[uuid]`）は認証不要の公開エンドポイント。個人情報保護のためメールアドレス等は含めず、氏名・コース名・発行日のみを返す設計にした
- 管理者向けコース編集画面（`/admin/courses/new`, `/admin/courses/[id]/edit`）は、既存の`POST/PUT /courses`APIの「`chapters`配列を丸ごと置換する」仕様をそのままUIに反映している。そのため保存の度に章・レッスンのIDが再生成される（既存の`lesson_progress`は`lesson_id`のON DELETE CASCADEで一緒に削除される）。**受講者がいるコースの章・レッスン構成を編集すると、そのコースの受講者の該当レッスン進捗がリセットされる**点に注意（今回のスコープでは許容し、個別更新APIの追加は見送った）
- 動作確認のためPowerShellから直接Supabase Admin APIを叩いてテスト管理者アカウント（`quiz-test-admin@example.com` / `QuizAdmin1!`, role: admin）を作成した。Supabase上にそのまま残っている（デモ・継続確認用）
- レポート: `GET /v1/reports/users`はロールでフィルタせず**全ユーザー**（admin/super_admin含む）を対象にしている。管理者自身も受講履歴があれば集計に含まれる（学習者のみに絞る要望が出た場合は`role`フィルタを追加すること）
- レポート: 「平均進捗率」は各ユーザー/各コースについて関連する`enrollments.progress_rate`の単純平均であり、レッスン数や受講開始時期による重み付けはしていない（シンプル構成という指示に合わせた設計）
- レポート: CSVは`Content-Disposition: attachment`かつBOM付きUTF-8で返しており、Excelで直接開いても文字化けしない設計にした。バイナリではないが`apiFetchBlob`/`authFetchBlob`（修了証PDF用に追加済み）をそのまま流用してダウンロードさせている
- 通知: メール送信は既存の`backend/src/lib/resend.ts`をそのまま利用しているため、**Resendのサンドボックス制限（アカウント所有者本人のメールアドレス以外へ送信不可）がそのまま適用される**。実データ確認時、学習者アカウント（`test@example.com`）への送信は全て`is_success: false`で記録された（`notification_logs.error_message`にResendの403エラーメッセージがそのまま残る）。本番運用時は独自ドメインをResendで検証し`RESEND_FROM_EMAIL`を変更する必要がある（パスワードリセットメールと同じ既知の制約）
- 通知: `node-cron`はExpressプロセス内で「毎分実行し、現在時刻(時:分)が設定値と一致した時だけ処理する」方式にした。設定変更時にcronパターン自体を書き換える必要がなく実装がシンプルになる一方、Renderで複数インスタンスに水平スケールした場合は同じ分に複数インスタンスが同時に送信処理を試みる可能性がある（`notification_logs`の重複チェックにより実際に二重メール送信されることは無いが、無駄なDB問い合わせは発生する）。将来水平スケールする場合はPostgresアドバイザリロック等の排他制御を検討すること
- 通知: 期限切れリマインダーの対象抽出は「今日から`reminder_days_before`日後まで」の範囲で行い、DBの`WHERE`句ではなくアプリ側でフィルタしている（テスト用フェイクDBが`.neq()`等の高度なクエリを再現できないため、実装をシンプルなJSフィルタに寄せた）。実運用でenrollment件数が非常に多くなった場合はDB側フィルタへの見直しを検討
- 通知: コース完了イベントの検知は「更新前のenrollment.statusを事前に変数へ保存してから比較する」実装にしている。Supabaseの実クライアントは毎回新しいオブジェクトを返すため問題にならないが、テスト用フェイクDBは行オブジェクトをミュータブルに共有するため、`enrollment.status`を更新後に直接参照すると常に更新後の値になってしまう問題にテストで気づき、`wasCompleted`という事前キャプチャ変数を導入して修正した（`backend/src/routes/courses.ts`）

## 直近の作業内容
- 2026-07-01: `docs/prompts/`の指示書を読み込み、`public.users`マイグレーションを提示。リフレッシュ/リセットトークンの保存方式についてユーザーに確認し、「開発環境はSupabase、本番はPostgres移行予定」の方針を確定。バックエンド雛形とログイン〜リフレッシュ〜ログアウトの一連のセッションAPIを実装し、テストも整備。
- 2026-07-01: Google OAuth（PKCE）、2FAセットアップ、ユーザーAPI（プロフィール・アバター）を実装。実装済み全機能をコミット（ローカルのみ、push未実施）。テストは29件全てパス。
- 2026-07-01: Resend実キー設定完了の連絡を受け、パスワードリセット（`POST /auth/password/reset`, `PUT /auth/password/update`）を実装。Supabase Admin APIの`generateLink(recovery)`でリンクを発行し、Resendで自前送信する方式（Supabase側のメール設定に依存しない）。これで指示書記載の全エンドポイントの実装が完了。テストは36件全てパス。
- 2026-07-01: フロントエンド（Next.js 16 + TypeScript + Tailwind v4）に着手し、ログイン・2FA・ダッシュボードの3画面を実装。実ブラウザでバックエンドと繋いだ通し確認を実施し、リロード時の競合状態バグを1件発見・修正。詳細は`SESSION_LOG.md`参照。
- 2026-07-02: `GET /v1/users/me/enrollments`（自分の受講中コース一覧）を新規追加し、ダッシュボードの「受講中コース一覧」セクションと接続。実データ（コース作成→受講登録→レッスン進捗更新）で通しの動作確認済み。テストは55件全てパス。
- 2026-07-01: マイグレーション適用完了の報告を受け、Supabaseダッシュボードの手動設定手順（Google Provider/Redirect URL/avatarsバケット）を案内。続けてコース管理ブロックに着手。仕様書のDB設計に`courses`/`enrollments`しかDDLが無いため、`categories`/`chapters`/`lessons`/`lesson_progress`を独自設計してマイグレーションを提示（ユーザー確認は得られず、推奨案のまま採用）。7.2.3記載の8エンドポイントを実装し、テストを14件追加（合計50件、全てパス）。テスト機能・修了証・レポート・グループ管理は別ブロックとして明示的にスコープ外にした。
- 2026-07-01: `20260701000002_create_courses_tables.sql`実行時に`public.set_updated_at() does not exist`エラーが発生（マイグレーション①で作成されるはずの関数が実DBに存在していなかった）。マイグレーション②を自己完結させる形に修正（`CREATE OR REPLACE FUNCTION`で再定義、`CREATE TABLE IF NOT EXISTS`化、`DROP TRIGGER IF EXISTS`追加）し、再実行して適用成功。**認証・コース管理両ブロックのDBスキーマがSupabaseに反映済み。**
- 2026-07-02: 残りのフロントエンド画面（`/forgot-password`, `/reset-password`, `/profile`）を実装。実際のSupabase recoveryリンクを生成してパスワードリセットのフルフロー（申請→リンク→再設定→新パスワードでログイン）を実データで確認、プロフィール編集・アバターアップロードも確認済み。認証・コース管理ブロックのフロントエンドはこれで一区切り。次はコース受講画面（コース詳細・レッスン視聴・進捗更新のUI）を優先し、その後テスト機能ブロックに進むことをユーザーに推奨。
- 2026-07-02: コース受講画面3つ（コース詳細・レッスン視聴・コース完了）を実装。動画/PDF/テキストの3種の実コンテンツを含むテストコースを新規作成し、受講登録からコース修了画面への自動遷移まで実データでフル動作確認。確認中に「ログイン応答のuserオブジェクトが`/users/me`と形が違う」バグを発見・修正（`routes/auth.ts`の独自`publicUser()`を廃止し`toPublicProfile()`に統一）。これで認証・コース管理ブロックのフロントエンドが機能的に完結。
- 2026-07-03: テスト機能ブロックに着手。DBスキーマ（`quizzes`/`questions`/`choices`/`quiz_attempts`/`quiz_answers`、「1コース=1テスト」設計）を提示しユーザー承認を得てからマイグレーションを作成、ユーザーがSupabase側で適用。バックエンドAPI（テスト取得・admin向け作成・回答送信/採点・受験履歴取得）を実装し、`recalculateEnrollmentProgress`をテスト合格も条件に含むよう拡張。Jestテスト8件追加（合計63件全てパス）。フロントエンドにテスト受験画面・結果画面を実装し、コース詳細画面にテストへの導線を追加。実データ（管理者APIでテスト付きコースを新規作成→学習者ブラウザで受講登録→レッスン完了→テスト合格→コース自動修了→ダッシュボード反映、誤答での再受験が履歴に残ることまで）を通しで確認。
- 2026-07-06: 管理者向けフロントエンド（コース管理・テスト管理・ユーザー管理）に着手。まず不足しているバックエンドAPIを洗い出し（コース・テストは既存APIで対応可、ユーザー一覧・更新のみ不足と判明）、`GET/PUT /v1/users`を追加（自己ロックアウト防止ガード付き）。Jestテスト7件追加（合計70件全てパス）。フロントエンドに`/admin/courses`（一覧・公開切替・削除）、`/admin/courses/new`・`/admin/courses/[id]/edit`（`CourseForm`共通コンポーネント、章・レッスンの追加/削除/並び替え）、`/admin/courses/[id]/quiz`（設問・選択肢編集）、`/admin/users`（ロール変更・有効化無効化）の5画面を実装し、`useRequireAdmin`フックで非admin/super_adminをダッシュボードへリダイレクト。実データで、学習者アカウントのアクセス拒否確認、管理者アカウントでのコース新規作成（章・レッスン付き）→編集画面へのプリフィル確認→テスト作成→ユーザーのロール変更/有効化無効化とロールバック→コース削除まで一通りブラウザで確認。
- 2026-07-07: 修了証発行ブロックに着手。確定パラメータ（日本語のみ、コース名・氏名・修了日・QRコードのシンプル構成、ダウンロード＋ブラウザプレビュー）を確認し、DBスキーマ（`certificates`。`id`と`verification_uuid`を分離、`UNIQUE(user_id, course_id)`で冪等性担保）を提示・承認を得てマイグレーションを作成、ユーザーがSupabase側で適用。PDF生成は`pdfkit`を採用（Render環境のCJKフォント欠如を避けるため）し、OFLライセンスのNoto Sans JP可変フォントをダウンロードして`backend/assets/fonts/`に同梱、日本語が正しくレンダリングされることを実際にPDF出力して確認。バックエンドAPI3本（発行・PDFダウンロード・QR検証）を実装、Jestテスト8件追加（合計78件全てパス）。フロントエンドに`/courses/[id]/certificate`（プレビュー・ダウンロード）、`/certificates/[uuid]`（認証不要のQR検証ページ）を実装し、コース完了画面・ダッシュボードに導線を追加。バイナリダウンロード用に`apiFetchBlob`/`authFetchBlob`を追加。実データで、修了済みコースからの発行→プレビュー表示→PDFダウンロード→QR検証ページでの内容確認→無効UUIDのエラー表示→再訪問時の冪等性（同一verificationUuidが返る）まで一通りブラウザで確認。
- 2026-07-07: レポートブロックを実装。確定パラメータ（集計軸は受講者別進捗一覧・コース別受講/修了率の両方、出力形式はCSV＋管理者画面ダッシュボード表示）を確認。DBマイグレーション不要（既存の`users`/`courses`/`enrollments`テーブルを集計するのみ）だったため、バックエンドAPI4本（`GET /reports/users`, `/courses`, `/users/csv`, `/courses/csv`。全てadmin/super_admin限定）を直接実装。CSVはBOM付きUTF-8でExcelでの文字化けを回避。Jestテスト7件追加（合計85件全てパス）。フロントエンドに`/admin/reports`（受講者別・コース別の2タブ、サマリーカード＋テーブル＋CSVダウンロードボタン）を実装し、`AdminHeader`に「レポート」リンクを追加。既存の`apiFetchBlob`/`authFetchBlob`（修了証ブロックで追加済み）をCSVダウンロードにもそのまま流用。実データで、受講者別タブの集計値（受講コース数・修了数・平均進捗率）とコース別タブの集計値（受講者数・修了率・平均進捗率）が正しいことを確認、両タブのCSVダウンロードボタンが実際にAPIを200 OKで呼び出すことを確認。
- 2026-07-07: 通知・リマインダーブロックを実装。確定パラメータ（通知種類は受講登録完了・コース修了・受講期限切れリマインダーの3種、実行方式は手動＋自動の両方、リマインダー送信タイミングは管理者が設定変更可能・デフォルト7日前）を確認。DBスキーマ（`notification_settings`シングルトン、`notification_logs`）を提示し4つの設計判断点（シングルトン運用／重複送信防止の考え方／`GET .../logs`エンドポイントの追加／node-cronの水平スケール時の注意）を含めて承認を得てからマイグレーションを作成、ユーザーがSupabase側で適用。バックエンドに`notificationRepository.ts`（設定の自動作成・更新、ログ記録・重複チェック）、`notificationService.ts`（3種の通知送信ロジック、Resend連携）、`routes/notifications.ts`（設定API・手動送信API・履歴API）を新規作成し、`node-cron`で毎分チェック方式の自動実行を`index.ts`に追加。既存の受講登録API・レッスン進捗更新API・テスト回答送信APIに通知フックを追加（コース完了は「未完了→完了」への遷移時のみ発火するよう、更新前ステータスを事前キャプチャする実装に修正——テスト用フェイクDBのオブジェクト共有により当初のバグをテストで発見）。Jestテスト13件追加（合計98件全てパス）。フロントエンドに`/admin/notifications`（設定フォーム・手動送信ボタン・送信履歴テーブル）を実装し`AdminHeader`に「通知」リンクを追加。実データで、設定変更の保存確認、手動送信（対象なしで0件応答）、新規コースへの受講登録による`enrollment_completed`ログ記録、レッスン完了によるコース修了と`course_completed`ログ記録までブラウザで確認（実際にResend APIを呼び出しており、送信失敗はサンドボックス制限の既知エラーとして正しく記録されることも確認）。
