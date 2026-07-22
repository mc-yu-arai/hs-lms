# PROJECT_STATUS

## プロジェクト概要
派遣会社向け学習管理システム「HS-LMS」。**認証・アカウント管理ブロック、コース管理ブロック、テスト機能ブロック、修了証発行ブロック、レポートブロック、通知・リマインダーブロック、グループ管理ブロック、ユーザー新規作成・CSVインポートブロック、ユーザー削除ブロック、カテゴリ管理ブロックのAPI実装が完了**。フロントエンド（Next.js、`frontend/`）は認証系（ログイン・2FA・パスワードリセット・プロフィール編集）、コース受講系（コース詳細・レッスン視聴・コース完了）、テスト機能系（テスト受験・結果表示）、管理者向け画面（コース管理・**カテゴリ管理**・テスト管理・ユーザー管理（新規作成モーダル・CSVインポートモーダル・削除ボタン）・レポート・通知・グループ管理）、修了証系（プレビュー・PDFダウンロード・QR検証ページ）の全24画面を実装済み。**本番環境（Vercel＋Render）へのデプロイが完了し、基本動作確認済み（2026-07-10）。**

## 技術スタック（確定）
- フロントエンド: Next.js（TypeScript）→ Vercel（**本番デプロイ済み**）
- バックエンドAPI: Node.js + Express（TypeScript）→ Render（`backend/`、**本番デプロイ済み**）
- データベース: PostgreSQL（Supabase）
- 認証基盤: Supabase Auth（`auth.users`）＋ アプリ用 `public.users`。ロール等のカスタムクレームはSupabase Auth Hookではなく、バックエンド側で `public.users.role` を都度参照する方式（Supabase固有機能への依存を避けるため）
- メール送信: Resend（実キー設定済み。パスワードリセットメールで利用中）
- ストレージ: Supabase Storage（`avatars`＝アイコン画像、`lesson-content`＝SCORM/LearnWizのzip展開先。いずれも公開バケット）

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
- [x] グループ管理ブロック: `groups`/`group_members`/`group_courses`のマイグレーション作成・適用済み（独自`id`＋`UNIQUE`制約による冪等性担保は`enrollments`/`certificates`と同じ設計方針）
- [x] グループ管理ブロック: `GET/POST /v1/groups`、`GET/PUT/DELETE /v1/groups/:id`、`POST/DELETE /v1/groups/:id/members`、`POST/DELETE /v1/groups/:id/courses`、`GET /v1/reports/groups/:id`、`GET /v1/reports/groups/:id/csv`の全10エンドポイントを実装（`backend/src/services/groupRepository.ts`, `groupRepository.ts`と分離した`groupService.ts`（受講登録自動作成のみを担当）, `routes/groups.ts`、レポートは既存`reportRepository.ts`/`routes/reports.ts`に追加）
- [x] グループ管理ブロック: コース割り当て時は現メンバー全員に、メンバー追加時はそのグループの割当済み全コースに、既存の受講登録が無い場合のみ`enrollments`を自動作成（`enrollment_completed`通知も発火）。メンバー削除・コース割り当て解除・グループ削除はいずれも既存の`enrollments`を削除しない設計
- [x] グループ管理ブロック: Jestテスト14件追加（CRUD・アクセス制御・メンバー/コース紐付けの冪等性・受講登録自動作成とその重複防止・削除時の非破壊性・レポート集計とCSV、合計112件全てパス）
- [x] グループ管理ブロック フロントエンド: `/admin/groups`（一覧・新規作成・削除）、`/admin/groups/[id]`（基本情報編集、メンバー追加/削除、コース割り当て/解除、グループ別進捗レポート表示・CSVダウンロード）を実装。`AdminHeader`に「グループ」リンクを追加
- [x] グループ管理ブロック: 実データで動作確認済み（グループ作成→コース割り当て→メンバー追加でそのコースへの受講登録が自動作成されることを確認、逆に新規コースを既存メンバーがいるグループへ割り当てた際も自動作成されることを確認、メンバー削除・コース割り当て解除・グループ削除のいずれでも既存の受講登録件数が変化しないことを確認、グループ別レポートの集計値とCSVダウンロードを確認）
- [x] ユーザー新規作成・CSVインポートブロック: `POST /v1/users`（手動作成。Supabase Authアカウント作成＋`public.users`登録、ランダム初期パスワードをResendでメール送信）、`POST /v1/users/import`（CSV一括インポート、事前全件バリデーション→1件でもエラーなら何も作成しない、作成フェーズ途中の失敗時は作成済み分を削除して疑似ロールバック）、`GET /v1/users/import/template`（CSVテンプレートDL）を実装（`backend/src/services/userImportService.ts`、`backend/src/lib/password.ts`（ポリシー準拠のランダムパスワード生成）、`backend/src/lib/csv.ts`（自前CSVパーサー）、`groupRepository.ts`に`findGroupByName`を追加）
- [x] ユーザー新規作成・CSVインポートブロック: グループ割り当ては全ユーザー作成成功後の最終フェーズとして実行し、既存の`groupService.ts`の`addGroupMemberAndSyncEnrollments`をそのまま再利用（CSV経由でも手動作成でも、割当済みコースへの受講登録自動作成という既存の仕様を踏襲）
- [x] ユーザー新規作成・CSVインポートブロック: Jestテスト14件追加（手動作成の正常系・重複メール・不正な入社日・存在しないグループ・グループ経由の受講登録自動作成、CSVの正常系・ヘッダー不足やメール/ロール/日付/グループの各バリデーションエラー・DB重複メール・作成途中失敗時のロールバック・テンプレートダウンロード、合計126件全てパス）
- [x] ユーザー新規作成・CSVインポートブロック フロントエンド: `frontend/src/lib/api.ts`の`ApiError`に`details`フィールドを追加（CSVの行別バリデーションエラーをUIに表示するため、レスポンスの`error`オブジェクト全体を保持するよう拡張）。`/admin/users`に「新規作成」「CSVインポート」ボタンを追加し、`NewUserModal.tsx`（氏名・メール・ロール・部署・入社日・グループ複数選択）、`ImportUsersModal.tsx`（ファイル選択・テンプレートDL・行別バリデーションエラー表示・成功件数表示）を新規実装
- [x] ユーザー新規作成・CSVインポートブロック: 実データで動作確認済み（手動作成でSupabase Authアカウントと`public.users`行が実際に作成されることを確認、CSVインポートで不正な行を含むファイルが全件エラー表示され何も作成されないことを確認、修正後の正常なCSVで複数件が一括作成されることを確認、CSVの`グループ`列で指定したグループへ実際に`group_members`が登録されることをAPI経由で確認）
- [x] ユーザー削除ブロック: `DELETE /v1/users/:id`（完全削除。自分自身は削除不可）を実装。無効化は既存の`PUT /v1/users/:id`の`isActive:false`で対応済みのため追加API無し。`backend/src/services/userDeletionService.ts`を新規作成し、`certificates`→`notification_logs`→`enrollments`→`public.users`→アバター画像→`auth.users`の順で削除（`avatarStorage.ts`に`deleteAvatar`を追加）。`lesson_progress`/`quiz_attempts`/`quiz_answers`は`enrollments`への、`group_members`は`public.users`へのON DELETE CASCADEでそれぞれ自動連鎖削除される
- [x] ユーザー削除ブロック: Jestテスト5件追加（アクセス制御・自己削除禁止・404・関連データ（受講登録/修了証/通知履歴）の連鎖削除・他ユーザーのデータが影響を受けないことの確認、合計131件全てパス）
- [x] ユーザー削除ブロック フロントエンド: `/admin/users`のユーザー一覧に「操作」列を追加し、確認ダイアログ（完全削除であることと無効化との違いを明示）付きの「削除」ボタンを実装。自分自身の行は削除ボタンを無効化
- [x] ユーザー削除ブロック: 実データで動作確認済み（CSVインポートで作成した検証用ユーザーを削除し、一覧から消えること・所属グループの`group_members`が実際にPostgresのON DELETE CASCADEで連鎖削除されること（削除前後でグループのメンバー数が1→0になることを確認）・削除後は同じメールアドレスでログインが401になることを確認。手動作成→即削除の一連の流れも確認）
- [x] カテゴリ管理ブロック: `GET/POST /v1/categories`（一覧取得は認証不要）、`PUT/DELETE /v1/categories/:id`を実装（`backend/src/services/categoryRepository.ts`, `routes/categories.ts`）。`categories`テーブル自体はコース管理ブロックで作成済みのため今回マイグレーション不要。一覧は`groups`の`listGroups`と同じ「2クエリ+JS集計」パターンで紐付きコース数`courseCount`を付与
- [x] カテゴリ管理ブロック: 同名カテゴリの作成・リネームは409で拒否（DB側の`UNIQUE(name)`制約を事前チェックで防御）。コースが1件でも紐付いているカテゴリの削除は409で拒否し、紐付き件数をメッセージに含める
- [x] カテゴリ管理ブロック: Jestテスト12件追加（一覧の認証不要確認・作成/リネームの重複名エラー・自分自身への同名リネーム許可・コース紐付き時の削除拒否、合計143件全てパス）
- [x] カテゴリ管理ブロック フロントエンド: `/admin/categories`（一覧・新規作成・インライン編集・削除（紐付きコース数を警告表示））を実装し`AdminHeader`に「カテゴリ」リンクを追加。`CourseForm.tsx`（コース新規作成・編集フォーム共通コンポーネント）に、これまで存在しなかったカテゴリ選択欄（APIから取得した一覧をセレクトボックスで表示）を追加
- [x] カテゴリ管理ブロック: 実データで動作確認済み（カテゴリ作成→コース作成フォームの選択肢に反映されることを確認→リネーム→コースへの紐付け→紐付きカテゴリの削除が409で拒否されることを確認→コース削除後にカテゴリ削除が成功することを確認）
- [x] 本番デプロイ: GitHub（`mc-tanaka/hs-lms`）へ全コミットをpush、フロントエンドをVercel、バックエンドをRenderへデプロイ。Renderの`NODE_ENV=production`による`devDependencies`スキップが原因のビルド失敗（詳細は`SESSION_LOG.md`の2026-07-09〜10参照）、およびVercel側の環境変数名の設定ミス（後述）を解消し、基本動作確認まで完了
- [x] コンテンツアップロード・再生ブロック: `lessons.content_type`に`'learnwiz'`追加・`scorm_version`カラム追加のマイグレーション作成・適用済み。Supabase Storageに新規公開バケット`lesson-content`を作成済み
- [x] コンテンツアップロード・再生ブロック: `POST /v1/uploads/lesson-content`（admin/super_admin限定、multipart、300MB上限）を実装。`backend/src/services/lessonContentStorage.ts`が`adm-zip`でzipを展開し、`imsmanifest.xml`/`lwConfig.xml`の有無でSCORM/LearnWizを自動判定、SCORMは`<schemaversion>`からバージョン(1.2/2004)も判定し、`index.html`をエントリポイントとして全ファイルを`lesson-content`バケットへアップロードする
- [x] コンテンツアップロード・再生ブロック: アップロードをレッスンのライフサイクルから独立させ（`POST/PUT /courses`のchapters全置換でレッスンIDが再生成される既存制約への対応）、返却された`contentUrl`を既存の「手入力URL欄」と同じ経路でレッスンに保存する設計を採用。`courses.ts`の`lessonSchema`に`contentType: 'learnwiz'`と`scormVersion`を追加、`contentUrl`のZod検証を`.url()`から非空文字列に緩和（Storage相対パスを許容するため）
- [x] コンテンツアップロード・再生ブロック: Jestテスト8件追加（アクセス制御・非zip拒否・SCORM1.2/2004判定・LearnWiz判定・manifest/index.html欠如時のエラー、合計151件全てパス）
- [x] コンテンツアップロード・再生ブロック: `frontend/src/app/api/lesson-content/[...path]/route.ts`に同一オリジン配信プロキシを実装。SCORMランタイムのクロスオリジンAPI探索問題と、Supabase Storageの無料/標準プランがHTMLファイルを`text/plain`で強制配信する既知の仕様上の制約を、拡張子ベースのContent-Type付け替えで同時に解決（詳細は`DB_SCHEMA.md`のコンテンツアップロード・再生ブロックの節を参照）
- [x] コンテンツアップロード・再生ブロック: `CourseForm.tsx`にSCORM/LearnWiz選択時のzipアップロードUI（ファイル選択・アップロード中表示・エラー表示・SCORMバージョン手動上書きセレクト）を追加
- [x] コンテンツアップロード・再生ブロック: レッスン視聴画面に`LearnWizLesson`（プロキシ経由iframe＋既存の手動完了ボタン）と`ScormLesson`（`scorm-again`を動的import、SCORMバージョンに応じ`Scorm12API`/`Scorm2004API`を`window.API`/`window.API_1484_11`にアタッチしてからiframe描画、完了イベントで`PUT .../progress`を自動呼び出し）を実装
- [x] コンテンツアップロード・再生ブロック: 実データで動作確認済み（SCORM 1.2・SCORM 2004・LearnWizそれぞれの自作テストパッケージをアップロード→コース作成→受講登録→レッスン視聴でSCORM側から`window.parent.API`が同一オリジン経由で発見できること→完了操作で進捗APIが自動更新されること→全レッスン完了でコース修了画面へ遷移することまで一通りブラウザで確認）
- [x] 管理者向け操作マニュアル: `docs/manual/admin_manual.md`を新規作成（本番URL`https://hs-lms.vercel.app`前提。ログイン・ユーザー管理・カテゴリ管理・コース管理・テスト管理・グループ管理・レポート・通知設定・よくあるトラブルの9章構成。実装済みの全管理画面のUI（`frontend/src/app/admin/`配下）を実際に確認した上で作成）
- [x] 管理者向け操作マニュアル: `docs/manual/admin_manual.docx`をNode.jsの`docx`パッケージで生成（見出し1/見出し2スタイル、CSV列構成の表、⚠️注意書きの枠線+背景色ボックス、画面説明ごとの「【スクリーンショット】」プレースホルダー16箇所を含む）。生成スクリプトはリポジトリ外のスクラッチ領域で使い捨て、`.docx`本体のみリポジトリに配置。LibreOffice/pandocが環境に無かったため、docx内部XML（`word/document.xml`）を直接検査してテキスト内容・表・プレースホルダー数を確認する形で検証した（見た目のレンダリング確認は未実施）
- [x] ユーザー編集機能: 既存の`PUT /v1/users/:id`（従来はロール・有効状態のみ対応）を拡張し、姓・名・部署・入社日・メールアドレスの変更にも対応。`backend/src/services/userRepository.ts`の`AdminUserUpdate`/`updateUserAsAdmin`にフィールドを追加し、新規関数`updateAuthEmailAsAdmin`を追加した
- [x] ユーザー編集機能: メールアドレス変更時はSupabase Auth側（`auth.users`）も同時更新する。既存のプロフィール編集（`PUT /users/me`）が使う「本人の確認メール方式」（`requestEmailChange`、`gotrueRest.ts`）とは異なり、管理者による変更は`supabaseAdmin.auth.admin.updateUserById(userId, { email, email_confirm: true })`をservice_role権限で直接呼び出し、確認メールを挟まず即時反映する設計にした。変更前に`findUserByEmail`で重複チェックし、他ユーザーが既に使用中のメールアドレスの場合は409 `email_already_exists`を返す。Auth側の更新に失敗した場合は400 `email_update_failed`を返し、`public.users`側は更新しない（Auth更新→DB更新の順で実行するため）
- [x] ユーザー編集機能: `routes/users.ts`の`adminUpdateUserSchema`に`lastName`/`firstName`/`department`/`hireDate`/`email`を追加。`hireDate`はユーザー新規作成（`createUserSchema`）と同じ`YYYY-MM-DD`正規表現＋`Date.parse`チェックのバリデーションを踏襲。自分自身へのPUTを禁止する既存の`self_modification_forbidden`ガードはそのまま維持（管理者は自分の情報を変更する場合`/profile`を使う）
- [x] ユーザー編集機能: Jestテスト7件追加（氏名・部署・入社日の変更、不正な入社日形式の拒否、メール変更とSupabase Auth同期の確認、メール重複時の409、Auth側更新失敗時に`public.users`が変更されないことの確認、メール未変更時はSupabase Auth APIを呼ばないことの確認）
- [x] ユーザー編集機能フロントエンド: `frontend/src/app/admin/users/EditUserModal.tsx`を新規作成（`NewUserModal.tsx`と同様のパターン）。`/admin/users`の一覧テーブルに「編集」列・ボタンを追加し、クリックで対象ユーザーの現在値がプリフィルされたモーダルを開く。自分自身の行は編集ボタンも無効化（バックエンドの制約と一致させるため）
- [x] ユーザー編集機能: 実データ（本番と同じSupabaseプロジェクトのローカル検証環境）で動作確認済み。テスト用アカウント`sato-manual-test@example.com`で、部署・入社日の変更→一覧への反映、メールアドレス変更→Supabase Auth側emailの即時同期、既存メールアドレスへの変更時の409エラー表示、を確認。確認後は元の値（`sato-manual-test@example.com`／総務部／入社日なし）に戻して後始末済み
- [x] 初期パスワードの固定化（`DEFAULT_USER_PASSWORD`環境変数）: 手動作成・CSVインポート両方で使う`provisionUser`（`userImportService.ts`）が、`env.DEFAULT_USER_PASSWORD`が設定されていればそれを、未設定ならこれまで通り`generateRandomPassword()`を初期パスワードとして使うよう変更。`backend/src/config/env.ts`に`DEFAULT_USER_PASSWORD: z.string().min(8).optional()`を追加。Renderに`DEFAULT_USER_PASSWORD=TestPass1!`を設定すれば、以後作成する全テスターアカウントが同じ初期パスワードになる（ウェルカムメール本文への平文記載は従来通り）。Jestテスト2件追加（手動作成・CSVインポートそれぞれで固定パスワードが実際にSupabase Auth作成APIへ渡ることを確認、`userDefaultPassword.test.ts`。バックエンド合計159件全てパス）
- [x] 動画アップロードブロック: `POST /v1/uploads/lesson-video`（admin/super_admin限定、multipart、500MB上限、MP4・MOV・AVIのみ拡張子で判定）を実装。`backend/src/services/videoStorage.ts`が拡張子からContent-Typeを決定して`videos`バケットへ`{uuid}.{ext}`としてアップロードし、`getPublicUrl()`で取得した**完全な公開URL**をそのまま返す設計にした（SCORM/LearnWizの`lesson-content`と異なり、動画はレッスン視聴画面の`<video src={lesson.contentUrl}>`が同一オリジンプロキシを経由せず`contentUrl`を直接使う既存実装のため、相対パスではなく公開URLをそのまま`content_url`に格納する必要がある）。Jestテスト7件追加（アクセス制御・非対応拡張子拒否・mp4/mov/avi＋大文字拡張子での正常アップロード、`lessonVideo.test.ts`。バックエンド合計166件全てパス）
- [x] 動画アップロードブロック: `CourseForm.tsx`のコンテンツ種別「動画」選択時に、SCORM/LearnWizと同じUIパターン（ファイル選択・アップロード中表示・エラー表示・格納先URL表示）のアップロードUIを追加。アップロード成功時は`lesson.contentUrl`に返却された公開URLを自動設定する（`handleVideoSelected`）。PDFのみ引き続き手入力URL欄のまま（今回のスコープ外）
- [x] 動画アップロードブロック: Supabase Storageに`videos`公開バケットをユーザーが作成、実データで動作確認済み。ブラウザの自動操作ツールにネイティブファイル選択ダイアログを操作する手段が無いため、ログイン中のブラウザセッションのJS実行コンテキスト内から`POST /v1/uploads/lesson-video`を直接呼び出す形で検証（アクセストークンはページ内で完結させ外部へは返却していない）。①ダミーバイト列（2048バイト、`video/mp4`拡張子）のアップロードが201で成功し、`videos`バケットの公開URLが返ることを確認、②その公開URLに直接アクセスしてContent-Type`video/mp4`・バイト数一致で取得できることを確認（バケットの公開設定・Content-Type設定を確認）、③そのURLを`contentUrl`に持つ動画レッスンを含む検証用コース「動画アップロード機能検証コース」をAPI経由で作成→受講登録→レッスン視聴画面を開き、`<video>`要素の`src`/`currentSrc`が正しくアップロード済みURLに設定されていることをDOM上で確認。**アップロードしたのは実際に再生可能なコーデックを持つ動画ファイルではないため、実際の動画再生（コーデックデコード成功）そのものは未確認**（`video.error.code`が`4`=`MEDIA_ERR_SRC_NOT_SUPPORTED`になることを確認済みだが、これはダミーデータゆえの想定内の結果であり、DB→API→フロントエンド→`<video src>`の配線自体は正しく機能していることの確認としては十分と判断した。環境にffmpeg等の動画生成ツールが無く実物のmp4を用意できなかったための代替検証）。検証用コースはSupabase上にそのまま残っている（他ブロックの検証用コースと同様の運用）

## 未着手・進行中
- [ ] CSRF対策（現状JWT Bearerのみでcookieを使っていないため優先度は下げているが、フロント実装時にcookie方式を採る場合は要対応）
- [ ] Supabaseのパスワードリカバリーリンクの有効期限設定（ダッシュボード側）が実際に1時間になっているかの確認
- [ ] プロフィール編集画面（`/profile`）はメールアドレス変更UIを含めていない（バックエンドの`PUT /users/me`はemailフィールドに対応済みだが、今回のスコープ指示に含まれなかったため未実装）

## 外部サービス側で追加設定が必要な項目（要ユーザー作業）
- [ ] Supabaseダッシュボード → Authentication → Providers でGoogle Providerを有効化し、Client ID/Secretを登録
- [ ] Supabaseダッシュボード → Authentication → URL Configuration の Redirect URLs に `http://localhost:3001/v1/auth/oauth/google/callback`（本番URLも later）を追加
- [ ] Supabase Storageに `avatars` という名前の公開バケットを作成（`POST /users/me/avatar` が書き込み先として使用）
- [x] Supabase Storageに `lesson-content` という名前の公開バケットを作成済み（SCORM/LearnWizのzip展開先。2026-07-14ユーザー確認）
- [x] Supabase Storageに `videos` という名前の公開バケットを作成済み（動画アップロード先。2026-07-22ユーザー確認）
- [ ] **Vercelの環境変数に `SUPABASE_URL`（backend/.envの`SUPABASE_URL`と同じ値、`NEXT_PUBLIC_`接頭辞は付けない）を追加すること**。コンテンツ配信プロキシ`app/api/lesson-content/[...path]`が使用する。当初`NEXT_PUBLIC_SUPABASE_URL`という名前で案内していたが、このルートはサーバー側でしか実行されないため接頭辞は不要と判明し`SUPABASE_URL`に変更した（詳細は`SESSION_LOG.md`の2026-07-14の節を参照）。接頭辞無しの通常のサーバー用環境変数はビルド時に埋め込まれずリクエストの都度読まれるため、追加後は基本的にRedeploy不要（Vercelの実行環境が新しい値を次のリクエストから使う）

## 既知の問題・保留中の判断事項
- **Renderのビルドキャッシュが古いコードを配信し続けることがある**: GitHubへpush→Renderのデプロイ画面で該当コミットが緑チェック「Deployed」と表示されていても、実際に動いているプロセスには変更が反映されていない場合がある（2026-07-22、ユーザー管理の編集機能を拡張した際に発生。バックエンドに新フィールドを追加するPUTリクエストが200 OKで返るのに実際は何も更新されない、という形で顕在化した）。「pushしてデプロイ完了しているはずなのに、コードの変更が本番で効いていない」という症状が出た場合は、Renderダッシュボードで対象サービスの「Manual Deploy」→**「Clear build cache & deploy」**を試すこと（実際にこれで解消した）
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
- グループ管理: 実データ確認のため作成した検証用コース「グループ自動受講登録検証コース」がSupabase上にそのまま残っている（`test@example.com`の受講登録1件付き）。検証に使った動作確認用グループ自体は確認完了後にAPI経由で削除済み（削除しても受講登録が残ることの確認を兼ねた）
- レポート: `GET /v1/reports/users`はロールでフィルタせず**全ユーザー**（admin/super_admin含む）を対象にしている。管理者自身も受講履歴があれば集計に含まれる（学習者のみに絞る要望が出た場合は`role`フィルタを追加すること）
- レポート: 「平均進捗率」は各ユーザー/各コースについて関連する`enrollments.progress_rate`の単純平均であり、レッスン数や受講開始時期による重み付けはしていない（シンプル構成という指示に合わせた設計）
- レポート: CSVは`Content-Disposition: attachment`かつBOM付きUTF-8で返しており、Excelで直接開いても文字化けしない設計にした。バイナリではないが`apiFetchBlob`/`authFetchBlob`（修了証PDF用に追加済み）をそのまま流用してダウンロードさせている
- 通知: メール送信は既存の`backend/src/lib/resend.ts`をそのまま利用しているため、**Resendのサンドボックス制限（アカウント所有者本人のメールアドレス以外へ送信不可）がそのまま適用される**。実データ確認時、学習者アカウント（`test@example.com`）への送信は全て`is_success: false`で記録された（`notification_logs.error_message`にResendの403エラーメッセージがそのまま残る）。本番運用時は独自ドメインをResendで検証し`RESEND_FROM_EMAIL`を変更する必要がある（パスワードリセットメールと同じ既知の制約）
- 通知: `node-cron`はExpressプロセス内で「毎分実行し、現在時刻(時:分)が設定値と一致した時だけ処理する」方式にした。設定変更時にcronパターン自体を書き換える必要がなく実装がシンプルになる一方、Renderで複数インスタンスに水平スケールした場合は同じ分に複数インスタンスが同時に送信処理を試みる可能性がある（`notification_logs`の重複チェックにより実際に二重メール送信されることは無いが、無駄なDB問い合わせは発生する）。将来水平スケールする場合はPostgresアドバイザリロック等の排他制御を検討すること
- 通知: 期限切れリマインダーの対象抽出は「今日から`reminder_days_before`日後まで」の範囲で行い、DBの`WHERE`句ではなくアプリ側でフィルタしている（テスト用フェイクDBが`.neq()`等の高度なクエリを再現できないため、実装をシンプルなJSフィルタに寄せた）。実運用でenrollment件数が非常に多くなった場合はDB側フィルタへの見直しを検討
- 通知: コース完了イベントの検知は「更新前のenrollment.statusを事前に変数へ保存してから比較する」実装にしている。Supabaseの実クライアントは毎回新しいオブジェクトを返すため問題にならないが、テスト用フェイクDBは行オブジェクトをミュータブルに共有するため、`enrollment.status`を更新後に直接参照すると常に更新後の値になってしまう問題にテストで気づき、`wasCompleted`という事前キャプチャ変数を導入して修正した（`backend/src/routes/courses.ts`）
- グループ管理: `groups`/`group_members`/`group_courses`削除時のカスケードはDB側の`ON DELETE CASCADE`に委ねており、アプリ側で子行を明示的に削除するコードは書いていない（`deleteCourse`が章・レッスンの削除を`ON DELETE CASCADE`任せにしているのと同じ方針）。テスト用フェイクDBはFK制約もカスケードも再現しないため、`groups.test.ts`ではグループ削除後に`group_members`/`group_courses`が残っていないことまでは検証していない（実運用はPostgresのFK制約で担保される）
- グループ管理: メンバー追加・コース割り当てのどちらが先でも、後から行われた操作の時点で「相手側」が存在すれば受講登録が自動作成される（コース→メンバーの順でもメンバー→コースの順でも同じ結果になる）。この対称性は実データでの動作確認で両方向とも確認済み
- グループ管理: グループと受講登録(`enrollments`)の間に追跡用の外部キーは持たせていない。そのため「このenrollmentはどのグループ経由で作られたか」は事後的に判別できない（要望があれば`enrollments`に`created_via_group_id`等の追加を検討すること）
- グループ管理: `POST /groups/:id/courses`はコースの`is_published`を問わずに割り当て可能（非公開コースでも割り当て自体は成功し、受講登録も作成される）。一方で学習者が自分で行う`POST /courses/:id/enroll`は`is_published`必須のため、非公開コースをグループ経由で割り当てた場合、学習者はダッシュボードにそのコースが表示されても`/courses/:id`から先の挙動を要確認（今回のスコープでは非公開コースでの実地確認はしていない）
- ユーザー新規作成・CSVインポート: 初期パスワードはメール本文にそのまま平文で記載する仕様（ユーザー指示による）。パスワードリセットのような「設定用リンク」方式ではないため、メール自体の盗み見・誤送信に対する耐性は無い。初回ログイン時の強制パスワード変更も未実装（指示のスコープ外としたため）
- ユーザー新規作成・CSVインポート: 環境変数`DEFAULT_USER_PASSWORD`を設定すると、手動作成・CSVインポート両方の初期パスワードがランダム生成の代わりにこの固定値になる（2026-07-22追加。検証用に全テスターへ同じ初期パスワードを配布したいという要望への対応）。`backend/src/config/env.ts`にオプショナル項目として追加（`z.string().min(8).optional()`）し、`userImportService.ts`の`provisionUser`で`env.DEFAULT_USER_PASSWORD ?? generateRandomPassword()`という優先順位にした。未設定時の挙動（ランダム生成・パスワードポリシー準拠）は変更していない。Render側で`DEFAULT_USER_PASSWORD=TestPass1!`のように設定すればそのまま全テスターの初期パスワードに使われる（初期パスワードは引き続きウェルカムメールの本文にも平文で記載される）
- ユーザー新規作成・CSVインポート: CSVインポートの「1件でもエラーで全件ロールバック」は2段階で実現している。①事前に全行をバリデーション（形式・重複・グループ実在確認）し、1件でもエラーがあれば何も作成しない。②全行バリデーション通過後、Supabase Authアカウント＋`public.users`行を1件ずつ作成し、途中で失敗したらそれまでに作成済みの分を削除して巻き戻す（`courseRepository.createCourse`の章・レッスン登録失敗時と同じ「疑似ロールバック」方式で、本物のDBトランザクションではない）。③グループへの割り当ては全ユーザー作成が完了した後の最終フェーズとして実行し、ここで失敗してもユーザー作成側のロールバックは行わない（グループ名は②の前に実在確認済みのため通常は失敗しない想定。`enrollments.user_id`に`ON DELETE CASCADE`が無く、受講登録済みユーザーの削除はFK制約で失敗するため、グループ割り当て後に安全にロールバックする手段が無いことも、この設計にした理由の一つ）
- ユーザー新規作成・CSVインポート: CSVの列見出しは日本語固定（姓,名,メールアドレス,ロール,部署,入社日,グループ）。列の並び順は問わないが、見出し文字列の表記ゆれ（全角/半角スペース混入等）には対応していない。`ロール`列の値は`learner`/`admin`/`super_admin`の生値のみ受け付け、日本語ラベル（受講者等）は不可
- ユーザー新規作成・CSVインポート: CSVアップロードも既存の`multer`インスタンス（画像アップロード用、2MB上限）を流用しているため、ファイルサイズ超過時のエラーメッセージは`errorHandler.ts`の`MulterError`分岐が返す「画像ファイルが不正です（JPEG/PNG、最大2MB）」という文言のまま表示される（CSV用の文言に出し分けていない軽微な表示上の既知の問題）
- ユーザー削除: `enrollments`/`certificates`/`notification_logs`の`user_id`には`ON DELETE CASCADE`が設定されていないため、`userDeletionService.ts`側で明示的に`certificates`→`notification_logs`→`enrollments`の順に削除してから`public.users`を削除している（この順序を誤るとFK違反で失敗する）。`lesson_progress`/`quiz_attempts`/`quiz_answers`は`enrollments`への、`group_members`は`public.users`へのON DELETE CASCADEに委ねており、アプリ側では明示的に削除していない（テスト用フェイクDBは実際のFK制約・カスケードを再現しないため、`userDeletion.test.ts`ではこの2つの連鎖削除は検証できておらず、実データでの動作確認（グループメンバー数の増減）で代わりに確認した）
- ユーザー削除: アバター画像の削除（Supabase Storage）は失敗しても致命的エラーにせず、ログに記録するのみでユーザー削除自体は続行する設計にした（パスワードリセットメール送信失敗時の扱いと同じ考え方）
- ユーザー削除: 完全削除は取り消せない破壊的操作のため、フロントエンドの確認ダイアログで「無効化との違い」を明示している。誤操作防止のための二段階確認や削除理由の入力などは今回のスコープには含めていない
- 本番デプロイ: フロントエンドのAPIベースURLは`frontend/src/lib/api.ts`が読む環境変数名`NEXT_PUBLIC_API_BASE_URL`が正。Vercel側で`NEXT_PUBLIC_API_URL`のように**名前を間違えて設定すると、コードは黙って開発用フォールバック（`http://localhost:3001`）にフォールバックし本番で通信できなくなる**（実際にこの設定ミスで発生し、変数名の修正＋再デプロイで解消した）。`NEXT_PUBLIC_*`はビルド時に埋め込まれるため、Vercel側で変数を追加・変更した場合は再起動ではなく**Redeploy**が必要
- 本番デプロイ: Renderのビルド環境は`NODE_ENV=production`で`npm install`を実行し`devDependencies`を全てスキップする。ビルド時にのみ必要なツール（TypeScriptコンパイラ等）は`dependencies`に置くのではなく、`backend/package.json`の`scripts.build`側で`npm install --include=dev`を明示的に呼ぶ方式にしてある（詳細な調査過程は`SESSION_LOG.md`の2026-07-09〜10参照）
- コンテンツアップロード: Supabase Storageの無料/標準プランは、アップロード時に`contentType`を明示指定してもHTMLファイルを常に`text/plain`として配信する既知の仕様がある（XSS対策と思われる。Pro+カスタムドメインなら回避可能との情報あり）。素朴に公開URLをiframeに読み込むと`<pre>`タグでソースコードがそのまま表示されてしまい何も動かない。`frontend/src/app/api/lesson-content/[...path]/route.ts`で拡張子ベースにContent-Typeを付け替えて配信することで回避している。**新しい拡張子のアセットを追加する場合は、このルートの`EXTENSION_MIME_TYPES`マップに追記を忘れないこと**（無いとフォールバックでSupabaseの返すContent-Typeがそのまま使われる）
- コンテンツアップロード: `scorm-again`パッケージ（v3.1.0時点）は型定義（`.d.ts`、サブパスの`scorm-again/scorm12`・`scorm-again/scorm2004`はdefault exportと宣言）と実際のESMビルド出力（named exportのみ）が食い違っている既知の不整合がある。サブパスimportすると型チェックは通るが実行時に`Scorm12API is not a constructor`で落ちる。回避策としてルートパッケージ`scorm-again`からのnamed importを使うこと（`frontend/src/app/courses/[id]/lessons/[lessonId]/page.tsx`の`ScormLesson`参照）。将来パッケージを更新する際はこの挙動が直っていないか確認すること
- コンテンツアップロード: SCORM 1.2と2004でscorm-againの完了イベント名の接頭辞が異なる（1.2は内部関数名が`LMSSetValue`/`LMSCommit`のため`on("LMSSetValue.cmi.core.lesson_status", ...)`、2004は`SetValue`/`Commit`のため`on("SetValue.cmi.completion_status", ...)`）。実装時にこれを取り違えて完了イベントが全く発火しない不具合を作り込みかけたため、両バージョンで実際にアップロード→再生→完了操作→進捗API呼び出しまでブラウザで確認済み
- コンテンツアップロード: 動作確認のため作成した検証用コース「コンテンツアップロード検証コース」「SCORM2004検証コース」とその受講登録・アップロード済みzipコンテンツ（`lesson-content`バケット内）はSupabase上にそのまま残っている（削除するには受講登録を先に消す必要があり、既存のコース削除API・UIでは受講済みコースを削除できない既存の制約に阻まれるため、他のブロックの検証用コースと同様に残置する運用とした）
- コンテンツアップロード: 複数SCO構成のSCORMマニフェスト（`imsmanifest.xml`内に複数`<resource>`）には対応していない。zip内の`index.html`（トップレベル優先、無ければ最初に見つかったもの）を単純にエントリポイントとする設計のため、マルチSCOパッケージをアップロードすると意図しないSCOが再生される可能性がある
- コンテンツアップロード: `suspend_data`によるSCORMのレジューム（前回の続きから再開）は実装していない（「進捗・完了のみでスコア不要」という指示に合わせて完了判定のみを連携する設計にしたため）
- コース公開設定: 非公開（`is_published: false`）のコースは、`GET /courses/:id`は非admin/super_adminに対して404「コースが見つかりません」を返し、`POST /courses/:id/enroll`は**adminであっても**404を返す（`!course.is_published`のみでガードしているため）。本番で「コースが見つかりません」「受講登録できない」と報告があった際は、まずそのコースが公開設定になっているかを疑うこと（実際にこのケースが本番で発生し、コード側に問題は無かった）
- パスワードリセット: 本番でリンクをクリックしてもログイン画面に戻ってしまう不具合が報告された際、`env.FRONTEND_URL`はコード・Render環境変数とも正しいことを確認済み（OAuthコールバックのエラーリダイレクトを使った副作用のない検証方法で確認）。原因はSupabase側にある可能性が高いと判断: Authentication → URL Configurationの「Redirect URLs」に本番の`/reset-password`等のURLが登録されていないと、Supabaseは`generateLink`の`redirectTo`を無視してSite URLへフォールバックする。フロントエンドのルート（`/`）は未ログイン時に`/login`へ即リダイレクトするため、結果的に「リンクを踏むとログイン画面に戻る」という症状になる。この設定はSupabaseダッシュボードでのみ変更可能なため、コード修正は行わず設定確認をユーザーに依頼した（詳細は`SESSION_LOG.md`の該当日付エントリ参照）

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
- 2026-07-07: グループ管理ブロックを実装。確定範囲（`groups`/`group_members`/`group_courses`のマイグレーション、admin/super_admin限定のCRUD・メンバー管理・コース一括割り当て/解除API、グループ別進捗レポート、`/admin/groups`フロントエンド）を確認。DBスキーマ（独自`id`＋`UNIQUE`制約で冪等性を担保する設計）と4つの設計判断点（コース割り当て時の現メンバー全員への受講登録自動作成／後からのメンバー追加時も割当済み全コースへ自動登録／メンバー削除・コース解除時に既存の受講登録は削除しない／グループ削除も同様に受講登録には影響しない）を提示し承認を得てからマイグレーションを作成、ユーザーがSupabase側で適用。バックエンドに`groupRepository.ts`（CRUD・メンバー/コースの純粋なデータアクセス）、`groupService.ts`（受講登録自動作成のみを担当する薄い層として分離）、`routes/groups.ts`（全8エンドポイント）を新規作成し、既存の`reportRepository.ts`/`routes/reports.ts`に`GET /reports/groups/:id`・`/csv`を追加。Jestテスト14件追加（合計112件全てパス）。フロントエンドに`/admin/groups`（一覧・作成・削除）、`/admin/groups/[id]`（編集・メンバー管理・コース割り当て・レポート表示/CSV）を実装し`AdminHeader`に「グループ」リンクを追加。実データで、コース→メンバーの順・メンバー→コースの順のどちらでも受講登録が正しく自動作成されること（`courseCount`の増分で確認）、メンバー削除・コース割り当て解除・グループ削除のいずれでも既存の受講登録件数が変化しないこと、グループ別レポートの集計値とCSVダウンロードが正しいことをAPI経由およびブラウザUI操作の両方で確認。なお本セッションではNext.jsのフォーム`<button type="submit">`に対する`preview_click`が実際のsubmitイベントを発火しない事象が複数箇所（ログイン画面・グループ作成フォーム）で再現し、`form.requestSubmit()`や`button.click()`をブラウザコンソール経由で直接呼び出すことで回避した（原因未特定、次セッション以降も同様の事象が出た場合はこの回避策を使うこと）。
- 2026-07-09〜10: 全コミットをGitHubへpush後、Vercel/Renderへの本番デプロイに着手。Renderのビルド失敗（`NODE_ENV=production`による`devDependencies`スキップが根本原因）を`backend/package.json`の`scripts.build`修正（`npm install --include=dev && tsc`）で解消し、Vercel側の環境変数名の誤り（`NEXT_PUBLIC_API_URL`ではなく正しくは`NEXT_PUBLIC_API_BASE_URL`）も特定・修正。**本番環境（Vercel＋Render）へのデプロイが完了し、基本動作確認済み。**詳細な調査過程は`SESSION_LOG.md`の該当日付エントリ参照。
- 2026-07-14: コンテンツアップロード・再生（SCORM/LearnWiz）機能に着手。実装前に設計上の懸念点を提示し、①同一オリジン配信プロキシ方式の採用、②アップロードをレッスンのライフサイクルから独立させる方針、③アップロードサイズ上限300MB、を含む全提案の承認を得た。`lessons.content_type`に`'learnwiz'`追加・`scorm_version`カラム追加のマイグレーションを提示・適用、Supabase Storageに`lesson-content`公開バケットを作成。バックエンドに`POST /v1/uploads/lesson-content`（`adm-zip`でzip展開、imsmanifest.xml/lwConfig.xmlでSCORM/LearnWiz判定、schemaversionでSCORMバージョン判定）を実装しJestテスト8件追加（合計151件全てパス）。フロントエンドに同一オリジン配信プロキシ`app/api/lesson-content/[...path]`、CourseFormのzipアップロードUI、レッスン視聴画面のLearnWiz/SCORM再生コンポーネント（`scorm-again`統合）を実装。実装中に3つの想定外の問題に遭遇し解決: (1) Supabase Storage無料/標準プランがHTMLを`text/plain`で強制配信する既知の仕様→プロキシ側で拡張子ベースにContent-Type付け替えで解決、(2) `scorm-again`のサブパスimportが型定義と実行時ビルドで食い違い`is not a constructor`エラー→ルートパッケージからのnamed importに変更、(3) SCORM 1.2/2004でイベントリスナー名の接頭辞が異なる（`LMSSetValue`系/`SetValue`系）ことに気づかず完了イベントが発火しない不具合→ライブラリのビルド済みソースを直接確認して正しいイベント名に修正。SCORM 1.2・SCORM 2004・LearnWizそれぞれ自作のテストパッケージをアップロードし、受講登録→再生→完了操作→進捗API自動更新→コース修了画面遷移までブラウザで一通り確認。**Vercel本番環境には`NEXT_PUBLIC_SUPABASE_URL`環境変数の追加がまだ必要**（次回セッション最優先で案内すること）。
- 2026-07-14（続き）: 本番環境でLearnWizコンテンツ再生時に「コンテンツがありません」エラーが発生するとの報告を受け調査。コード自体に production 固有のバグは無かったが、根本原因は環境変数の設計ミスと判明: `app/api/lesson-content/[...path]/route.ts`が読む`NEXT_PUBLIC_SUPABASE_URL`は**サーバー側でしか使わないコードなのに誤って`NEXT_PUBLIC_`接頭辞を付けていた**ため、Next.jsのビルド時インライン化の対象になり、Vercelで値を追加してもRedeployし忘れると反映されない状態になっていた（`NEXT_PUBLIC_API_BASE_URL`の一件と同じ種類の落とし穴）。恒久対策として、このルートが使う環境変数名を接頭辞無しの`SUPABASE_URL`に変更（ビルド時に埋め込まれずリクエストの都度`process.env`から読まれるため、以後Redeploy忘れの心配がなくなる）。あわせて`fetch`失敗時の例外を握りつぶさずログ出力するよう`route.ts`を補強し、`.env.example`/`.env.local`も追随。ローカルで動作確認済み。詳細は`SESSION_LOG.md`の該当日付エントリ参照。
- 2026-07-14（続き2）: 本番環境でコース詳細画面に「コースが見つかりません」、`/quiz`・`/enroll`が404になるとの報告を受け、該当コースIDをSupabaseに直接問い合わせて調査。コースは実在したが`is_published: false`（非公開）だったことが原因と判明。非公開コースはadmin以外に404を返し、受講登録（`enroll`）はadminであっても404になる既存の仕様通りの動作であり、コード修正は不要と回答。コースを公開状態に切り替えることで解消することを案内。
- 2026-07-14（続き3）: 本番環境でパスワードリセットのメールリンクを踏むとログイン画面に戻ってしまうとの報告を受け調査。`env.FRONTEND_URL`が本番のRenderバックエンドで正しく`https://hs-lms.vercel.app`に設定されていることを、OAuthコールバックのエラーリダイレクトを利用した副作用のない方法で確認（コード・環境変数とも問題なし）。原因はSupabaseダッシュボードのAuthentication → URL Configuration → Redirect URLsに本番の`/reset-password`が登録されておらず、Supabaseがリダイレクト先をSite URLへフォールバックしていることによるものと判断。フロントエンドのルート(`/`)が未ログイン時に`/login`へ即座にリダイレクトする実装のため、症状と正確に一致することを確認。コード修正は行わず、Supabaseダッシュボードでの設定確認をユーザーに依頼。
- 2026-07-14（続き4）: `docs/handoff/PROJECT_STATUS.md`記載の実装済み機能と、実際の管理画面のUI実装（`frontend/src/app/admin/`配下の全ページ・モーダル）を確認した上で、`docs/manual/admin_manual.md`（管理者向け操作マニュアル）を新規作成。本番URL`https://hs-lms.vercel.app`を前提に、ログイン・初期設定/ユーザー管理/カテゴリ管理/コース管理/テスト管理/グループ管理/レポート/通知設定/よくあるトラブルの9章構成。2FAは自己設定用のUIが存在しないことや、コース編集で受講者の進捗がリセットされる仕様等、実装上の制約も troubleshooting セクションに正直に反映した。
- 2026-07-22: 管理者向けユーザー管理に編集機能を追加。既存の`PUT /v1/users/:id`（ロール・有効状態のみ対応）を拡張し、姓・名・部署・入社日・メールアドレスの変更に対応。メールアドレス変更時はSupabase Auth側（`auth.users`）もservice_role権限（`supabaseAdmin.auth.admin.updateUserById`）で即時同期する設計にした（本人による変更が使う確認メール方式とは別経路）。Jestテスト7件追加（バックエンド合計158件、全てパス）。フロントエンドに`EditUserModal.tsx`を新規実装し、`/admin/users`一覧に「編集」ボタンを追加。実データ（本番と同じSupabaseプロジェクト、テスト用アカウント`sato-manual-test@example.com`）で、部署・入社日変更、メールアドレス変更とSupabase Auth側の同期、メール重複時の409エラー表示までブラウザで確認し、確認後は元の値に戻して後始末済み。
