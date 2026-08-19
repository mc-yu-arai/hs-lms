# HS-LMS ローカル開発環境セットアップ手順書

対象読者: 新規参加の開発者
このマニュアルは `docs/handoff/PROJECT_STATUS.md`・`docs/handoff/ENV_SETUP.md`（2026-08-19時点の内容）をもとに作成しています。両ドキュメントは今後も更新されるため、記載内容に差異が出た場合はそちらを正としてください。

> **重要**: このプロジェクトは開発用・本番用でSupabaseプロジェクトを分けていません。ローカル開発で使う`.env`の接続先は**本番と同じSupabaseプロジェクト（同じデータベース）**です。ローカルで動作確認する際も、既存データの削除・書き換えには十分注意してください（詳細は[8. 開発時の注意事項](#8-開発時の注意事項)参照）。

---

## 目次

1. [必要なツール・前提条件](#1-必要なツールぜんてい条件)
2. [リポジトリのクローン手順](#2-リポジトリのクローン手順)
3. [環境変数の設定](#3-環境変数の設定)
4. [Supabaseプロジェクトへのアクセス権限取得](#4-supabaseプロジェクトへのアクセス権限取得)
5. [バックエンドの起動（ローカル）](#5-バックエンドの起動ローカル)
6. [フロントエンドの起動（ローカル）](#6-フロントエンドの起動ローカル)
7. [テストの実行方法](#7-テストの実行方法)
8. [開発時の注意事項](#8-開発時の注意事項)

---

## 1. 必要なツール・前提条件

| ツール | バージョン目安 | 備考 |
|---|---|---|
| Node.js | 20 LTS 以降（22 / 24でも動作確認済み） | `backend/`・`frontend/`とも`package.json`に`engines`指定は無いが、`@types/node`が20系を対象にしている。Next.js 16 / React 19を使うため18以下の古いバージョンは避けること |
| npm | Node.js同梱のもので可 | `backend/`・`frontend/`それぞれに独立した`package-lock.json`があり、ルートに共通の`package.json`は無い（npm workspacesは未使用） |
| Git | 2.4x以降推奨 | |
| GitHub CLI (`gh`) | 任意 | 現状このプロジェクトはGitHub Actions等のCIを持たず、`gh`を前提にした運用ルールも定めていない。ターミナルからIssue/PR操作をしたい場合にインストールすると便利（`gh auth login`で認証）程度の位置づけ |
| エディタ | 指定なし | TypeScriptの型チェックが効くもの（VSCode等）を推奨。バックエンド・フロントエンドとも全面的にTypeScript |

このほか、[4. Supabaseプロジェクトへのアクセス権限取得](#4-supabaseプロジェクトへのアクセス権限取得)にあるとおり、Supabaseのアカウント（無料で作成可）が必要です。

---

## 2. リポジトリのクローン手順

1. GitHubリポジトリ（`mc-tanaka/hs-lms`）へのアクセス権限を、現在のプロジェクトオーナーに依頼してください（Collaboratorとして招待してもらう）。
2. 任意の作業ディレクトリでクローンします。

   ```bash
   git clone https://github.com/mc-tanaka/hs-lms.git
   cd hs-lms
   ```

3. リポジトリ構成は以下の通りです（抜粋）。

   ```
   hs-lms/
   ├─ backend/            # Express製バックエンドAPI
   ├─ frontend/           # Next.js製フロントエンド
   ├─ supabase/migrations/# DBマイグレーション（SQLファイル、手動適用）
   ├─ docs/
   │  ├─ handoff/         # 引き継ぎドキュメント（PROJECT_STATUS.md等）
   │  └─ manual/          # 操作マニュアル（本ファイルもここ）
   └─ .env.example        # バックエンド用の環境変数テンプレート（ルート直下）
   ```

4. `.env`はリポジトリのルート直下に置きます（`backend/`配下ではありません）。バックエンドは`dotenv`でルート直下の`.env`を読み込む実装になっています（`backend/src/config/env.ts`）。次の手順で作成します。

---

## 3. 環境変数の設定

環境変数は2箇所に分かれています。**バックエンド用（リポジトリルート直下の`.env`）**と、**フロントエンド用（`frontend/.env.local`）**です。

### 3.1 バックエンド用（ルート直下の`.env`）

1. ルート直下の`.env.example`をコピーして`.env`を作成します。

   ```bash
   cp .env.example .env
   ```

2. 各値を以下の取得元から設定します。

   | 変数 | 取得元 | 備考 |
   |---|---|---|
   | `SUPABASE_URL` | Supabaseダッシュボード → Settings → API | プロジェクトへのアクセス権限取得は[4章](#4-supabaseプロジェクトへのアクセス権限取得)参照 |
   | `SUPABASE_PUBLISHABLE_KEY` | 同上（旧称: anon public key） | |
   | `SUPABASE_SECRET_KEY` | 同上（旧称: service_role key） | **バックエンド専用・厳秘。フロントエンドや`NEXT_PUBLIC_`系の変数には絶対に入れないこと** |
   | `JWT_SECRET` | 各自ランダム生成（32文字以上） | 生成例: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console → APIとサービス → 認証情報 | ローカルでGoogleログインを試す場合のみ必要。未設定でもメール/パスワードログインは動作する（`env.ts`でoptional扱い） |
   | `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Resendダッシュボード → API Keys | 同上。未設定でもサーバー自体は起動する（メール送信系の動作確認をしたい場合のみ必要） |
   | それ以外（`API_BASE_URL`・`FRONTEND_URL`・`LOGIN_MAX_ATTEMPTS`等） | `.env.example`の値をそのまま使用 | ローカル開発ではデフォルト値のままで問題ない |

   > `SUPABASE_URL`・`SUPABASE_PUBLISHABLE_KEY`・`SUPABASE_SECRET_KEY`の3つ以外は、Google OAuth・Resendを試さない限りは未設定でもバックエンドは起動します（`backend/src/config/env.ts`のZodスキーマで両方ともoptional）。まずはSupabaseの3値だけ設定して起動できることを確認するのがおすすめです。

### 3.2 フロントエンド用（`frontend/.env.local`）

1. `frontend/.env.example`をコピーして`frontend/.env.local`を作成します。

   ```bash
   cp frontend/.env.example frontend/.env.local
   ```

2. 各値を設定します。

   | 変数 | 値（ローカル開発） | 備考 |
   |---|---|---|
   | `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3001` | バックエンドの`API_BASE_URL`と一致させる |
   | `NEXT_PUBLIC_SESSION_TIMEOUT_MINUTES` | `30` | バックエンドの`SESSION_TIMEOUT_MINUTES`と一致させる |
   | `SUPABASE_URL` | バックエンドの`.env`と同じ値 | SCORM/LearnWizコンテンツ配信プロキシ（`frontend/src/app/api/lesson-content/[...path]/route.ts`）がサーバー側でのみ使用。**`NEXT_PUBLIC_`接頭辞を付けないこと**（付けるとビルド時にJSバンドルへ値が焼き込まれてしまうため。詳細は`frontend/.env.example`のコメント参照） |

`.env`・`frontend/.env.local`とも`.gitignore`済みです。誤ってコミットしないよう注意してください。

---

## 4. Supabaseプロジェクトへのアクセス権限取得

このプロジェクトは開発用・本番用を分けず、単一のSupabaseプロジェクトを共有しています。新規参加者は以下の手順でアクセス権を取得してください。

1. [Supabase](https://supabase.com/)のアカウントを作成します（GitHubアカウントでのサインアップ可）。
2. 現在のプロジェクトオーナー（管理担当者）に、自分のSupabaseアカウントのメールアドレスを伝え、既存のHS-LMSプロジェクトへCollaborator（メンバー）として招待してもらいます。
3. 招待メールを承諾すると、Supabaseダッシュボードから対象プロジェクトを開けるようになります。
4. プロジェクトを開いた状態で **Settings → API** から、`.env`に設定する`SUPABASE_URL`・`SUPABASE_PUBLISHABLE_KEY`（Publishable key）・`SUPABASE_SECRET_KEY`（Secret key）を取得できます。

> **Secret keyの扱いに注意**: Secret key（旧称 service_role key）はRow Level Securityを無視して全テーブルにフルアクセスできる強力な権限を持ちます。バックエンドの`.env`以外（フロントエンド、Gitへのコミット、チャット等）に絶対に貼らないでください。

Google OAuthログインをローカルで試したい場合は、加えて以下の設定がSupabaseダッシュボード側で必要です（既に本番用に設定済みのため、ローカル用に追加設定するのは主に3.のRedirect URLです）。

1. Authentication → Providers → Google が有効化されていることを確認（既に有効化済みのはず）
2. Authentication → URL Configuration → Redirect URLs に `http://localhost:3001/v1/auth/oauth/google/callback` が含まれているか確認し、無ければ追加

---

## 5. バックエンドの起動（ローカル）

```bash
cd backend
npm install
npm run dev
```

- `npm run dev`は`tsx watch src/index.ts`を実行し、`http://localhost:3001`（`.env`の`PORT`、デフォルト3001）でAPIサーバーが起動します。ファイル変更を検知して自動リロードします。
- 起動時に`.env`のバリデーション（Zod）が走ります。必須項目（`SUPABASE_URL`・`SUPABASE_PUBLISHABLE_KEY`・`SUPABASE_SECRET_KEY`・`JWT_SECRET`）が不足していると、エラーメッセージを出して起動に失敗します。
- 起動確認: `curl http://localhost:3001/health` で `{"status":"ok"}` が返れば正常です。

> **`npx tsx src/index.ts`を直接叩かないこと**: 過去に開発時、`npm run dev`ではなく`npx tsx src/index.ts`を直接実行してしまい、ファイル変更が自動リロードされず「コードを直したのにAPIの挙動が古いまま」という事象が発生しました（原因特定に時間がかかった既知のハマりどころです）。必ず`npm run dev`を使ってください。

---

## 6. フロントエンドの起動（ローカル）

バックエンドを別ターミナルで起動した状態（[5章](#5-バックエンドの起動ローカル)）で、以下を実行します。

```bash
cd frontend
npm install
npm run dev
```

- `http://localhost:3000` でNext.jsの開発サーバーが起動します。
- `frontend/.env.local`が無い、または`NEXT_PUBLIC_API_BASE_URL`がバックエンドの起動URLと一致していないと、ログイン等のAPI通信が失敗します。
- ログインには、Supabase側に既に登録済みのアカウントが必要です。自分用のアカウントが無い場合は、既存の管理者アカウントを持つメンバーにユーザー作成（管理画面の「新規作成」、またはSupabase Auth経由）を依頼してください。学習者向け画面・管理者向け画面それぞれの操作方法は[`docs/manual/admin_manual.md`](admin_manual.md)を参照してください。
- 動画・PDF・SCORM/LearnWizコンテンツのアップロード・再生を試す場合は、Supabase Storageの`avatars`・`lesson-content`・`videos`の3バケットが対象プロジェクトに作成済みであることを確認してください（新規プロジェクトを立てる場合は`docs/handoff/PROJECT_STATUS.md`の「外部サービス側で追加設定が必要な項目」を参照）。

---

## 7. テストの実行方法

### 7.1 バックエンド

```bash
cd backend
npm test
```

- Jestで実行されます。テストは`backend/tests/setupEnv.ts`（`jest.config.js`の`setupFiles`）でダミーの環境変数を読み込み、Supabase実クライアントの代わりにテスト専用のフェイクDB（`tests/helpers/fakeSupabase.ts`）を使う設計のため、**実際のSupabaseプロジェクトやリポジトリルートの`.env`が無くても実行できます**。
- 型チェックのみ行いたい場合は `npm run lint`（`tsc --noEmit`をアプリ本体・テストの両方の`tsconfig`で実行）を使用します。

### 7.2 フロントエンド

フロントエンドには現時点で自動テスト（Jest等）は整備されていません。以下のチェックのみ利用できます。

```bash
cd frontend
npm run lint          # ESLint
npx tsc --noEmit      # 型チェック（package.jsonに専用scriptは無いため直接実行）
```

コード変更後は、上記に加えて[6章](#6-フロントエンドの起動ローカル)の手順で実際にブラウザから動作確認することを推奨します。

---

## 8. 開発時の注意事項

### 8.1 ブランチ運用

現状このプロジェクトは`master`ブランチへの直接コミットで開発を進めており、フィーチャーブランチ・プルリクエストのワークフローは確立していません（`git log`で確認できる通り、これまでの全コミットが`master`上に直接積まれています）。複数人での並行開発に移行する際は、チームでブランチ運用ルール（例: `feature/*`ブランチ＋PRレビュー）を別途決めることを推奨します。

### 8.2 デプロイ・本番環境

- フロントエンド（Vercel）・バックエンド（Render）とも、`master`へのpushで自動デプロイされます。CI（GitHub Actions等）は未導入のため、pushする前にローカルでテスト・lintを通しておくことが実質的な品質担保になります。
- 本番URL: `https://hs-lms.vercel.app`（フロントエンド）

### 8.3 共有Supabaseプロジェクトについて（再掲）

冒頭にも記載の通り、ローカル開発は本番と同じSupabaseプロジェクトに接続します。別環境用のテストデータを作る場合は、既存データ（他の開発者が動作確認用に残しているコース・ユーザー等）を誤って削除しないよう注意してください。動作確認用に作成したコース・ユーザーは、`docs/handoff/PROJECT_STATUS.md`の記載にならい「検証用」とわかる名前にし、放置する場合はその旨をPROJECT_STATUS.mdに追記する運用にしています。

### 8.4 開発中によくあるハマりどころ

以下は特にローカル環境構築・開発初期でつまずきやすいものの抜粋です。**網羅的な既知の問題一覧は`docs/handoff/PROJECT_STATUS.md`の「既知の問題・保留中の判断事項」を参照してください**（本ファイルでの重複転記はしていません）。

- **バックエンドは必ず`npm run dev`で起動する**（[5章](#5-バックエンドの起動ローカル)参照）
- **`.env`はリポジトリルート直下**（`backend/`配下ではない）。`NEXT_PUBLIC_`接頭辞の環境変数はNext.jsのビルド時にJSバンドルへ焼き込まれるため、値を変更したら開発サーバーの再起動が必要（本番Vercelの場合はRedeployが必要）
- `scorm-again`パッケージは、サブパス（`scorm-again/scorm12`等）からimportすると型チェックは通るが実行時に`is not a constructor`で落ちる既知の不整合がある。ルートパッケージ（`scorm-again`）からのnamed importを使うこと（`frontend/src/app/courses/[id]/lessons/[lessonId]/page.tsx`の`ScormLesson`が実例）
- Supabase Storageの無料/標準プランはHTMLファイルを常に`text/plain`として配信する仕様があるため、SCORM/LearnWizコンテンツは`frontend/src/app/api/lesson-content/[...path]/route.ts`の同一オリジン配信プロキシ経由で必ず読み込む設計になっている（Storageの公開URLを直接iframeに入れても動かない）
- 非公開（`isPublished: false`）のコースは、管理者であっても`enroll`が404になる仕様（バグではない）

### 8.5 引き継ぎドキュメントの更新

このプロジェクトは複数セッション・複数人での引き継ぎを前提に、`docs/handoff/`配下のドキュメントを常に最新化する運用ルールを設けています（詳細は[`docs/prompts/00_共通運用ルール_引き継ぎドキュメント.md`](../prompts/00_共通運用ルール_引き継ぎドキュメント.md)）。作業に着手する前に`docs/handoff/PROJECT_STATUS.md`と`docs/handoff/SESSION_LOG.md`の直近項目に目を通し、区切りの良いタイミングで更新することを心がけてください。
