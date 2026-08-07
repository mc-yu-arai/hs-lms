// SCORM/LearnWizコンテンツをアプリ自身のオリジンで配信するプロキシ。
// SCORMランタイム(scorm-again)はiframe内から window.parent.API を辿って探すため、
// Supabase Storageの公開URL(別オリジン)をそのままiframeに読み込むと同一オリジンポリシーで失敗する。
// このルートを経由させることでiframeのsrcを常に自オリジンにし、index.htmlが相対パスで参照する
// アセット(js/css/画像等)もこの同じルート配下に自然に解決される。

// このルートはサーバー側でのみ実行される(ブラウザに公開する必要がない)ため、あえてNEXT_PUBLIC_接頭辞を
// 使わない。NEXT_PUBLIC_接頭辞の環境変数はNext.jsがビルド時に値をJSバンドルへ直接埋め込むため、
// Vercelダッシュボードで値を追加/変更した後に再デプロイを忘れると古い(未設定の)値のまま動き続けてしまう
// 問題が過去に発生した(NEXT_PUBLIC_API_BASE_URLの件、SESSION_LOG.md参照)。接頭辞無しの通常のサーバー用
// 環境変数はビルド時に埋め込まれず実行のたびにprocess.envから読まれるため、この種の取りこぼしを避けられる。
const SUPABASE_URL = process.env.SUPABASE_URL;

// SupabaseのStorageは無料/標準プランではHTMLファイルをtext/htmlとして配信せず、
// XSS対策として強制的にtext/plainへ差し替えて返す(アップロード時にcontentType: text/htmlを
// 指定していても無視される、Supabase側の既知の仕様)。iframeにHTMLとして描画させるには
// このプロキシ側で拡張子から正しいContent-Typeを付け直す必要がある。
const EXTENSION_MIME_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  mjs: "application/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  eot: "application/vnd.ms-fontobject",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
};

function resolveContentType(objectPath: string, upstreamContentType: string | null): string {
  const ext = objectPath.split(".").pop()?.toLowerCase();
  if (ext && EXTENSION_MIME_TYPES[ext]) return EXTENSION_MIME_TYPES[ext];
  return upstreamContentType || "application/octet-stream";
}

// SCORM/LearnWizパッケージ側のindex.html自体に、スマホでのピンチズームを禁止する
// <meta name="viewport" content="...,maximum-scale=1,user-scalable=no"> 等が埋め込まれているケースがある
// (パッケージ生成ツール側の仕様。中身は編集できないためプロキシ側で配信時に書き換える)。
// 属性の並び順(name/contentどちらが先か)は問わず、viewportメタタグのcontent値のみを
// ズーム制限の無い値に差し替える。viewport以外のmetaタグはそのまま素通しする。
function sanitizeViewportMeta(html: string): string {
  return html.replace(/<meta\b[^>]*>/gi, (tag) => {
    if (!/\bname\s*=\s*["']viewport["']/i.test(tag)) return tag;
    return tag.replace(/content\s*=\s*(["'])[^"']*\1/i, 'content="width=device-width, initial-scale=1"');
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!SUPABASE_URL) {
    console.error("[lesson-content proxy] SUPABASE_URL is not configured");
    return new Response("SUPABASE_URL is not configured", { status: 500 });
  }

  const { path } = await params;
  const objectPath = path.map(encodeURIComponent).join("/");
  const targetUrl = `${SUPABASE_URL}/storage/v1/object/public/${objectPath}`;

  const headers = new Headers();
  const range = request.headers.get("range");
  if (range) headers.set("range", range);

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, { headers });
  } catch (err) {
    console.error("[lesson-content proxy] fetch to Supabase Storage failed", targetUrl, err);
    return new Response("コンテンツの取得に失敗しました", { status: 502 });
  }

  if (!upstream.ok && upstream.status !== 206) {
    console.error("[lesson-content proxy] upstream returned", upstream.status, targetUrl);
    return new Response("コンテンツが見つかりません", { status: upstream.status === 404 ? 404 : upstream.status });
  }

  const responseHeaders = new Headers();
  const passthroughHeaders = ["content-length", "accept-ranges", "content-range", "cache-control", "etag"];
  for (const key of passthroughHeaders) {
    const value = upstream.headers.get(key);
    if (value) responseHeaders.set(key, value);
  }
  const contentType = resolveContentType(objectPath, upstream.headers.get("content-type"));
  responseHeaders.set("content-type", contentType);
  if (!responseHeaders.has("cache-control")) {
    responseHeaders.set("cache-control", "private, max-age=3600");
  }

  // HTMLのみ本文を読み込んでviewportメタタグを書き換える。動画等のバイナリはRangeリクエスト対応のため
  // upstream.bodyをストリームのまま素通しする必要があり、対象外(サイズも書き換え対象より大きいため妥当)。
  if (contentType.startsWith("text/html")) {
    const html = await upstream.text();
    const sanitized = sanitizeViewportMeta(html);
    responseHeaders.delete("content-length"); // 書き換えでバイト数が変わるため上流の値は無効
    // upstream(Supabase Storage)の`public, max-age=3600`をそのまま流用すると、このプロキシ側の書き換え
    // ロジック(sanitizeViewportMeta等)を修正してデプロイしても、ブラウザ/Vercelエッジキャッシュ双方に
    // 最大1時間古いHTMLが残り続け「直したのにスマホでは直っていない」という状態を招く
    // (2026-08-07の実機検証で、本番のindex.htmlがx-vercel-cache: HITで返っていたことから発覚)。
    // HTMLは書き換え後のバイト数もごく小さいため、常に最新を配信するようno-cacheで上書きする
    // (ブラウザにキャッシュさせない訳ではなくETagでの再検証を毎回強制する。js/css/画像等は対象外)。
    responseHeaders.set("cache-control", "no-cache");
    return new Response(sanitized, { status: upstream.status, headers: responseHeaders });
  }

  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
