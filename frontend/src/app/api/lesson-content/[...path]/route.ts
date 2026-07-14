// SCORM/LearnWizコンテンツをアプリ自身のオリジンで配信するプロキシ。
// SCORMランタイム(scorm-again)はiframe内から window.parent.API を辿って探すため、
// Supabase Storageの公開URL(別オリジン)をそのままiframeに読み込むと同一オリジンポリシーで失敗する。
// このルートを経由させることでiframeのsrcを常に自オリジンにし、index.htmlが相対パスで参照する
// アセット(js/css/画像等)もこの同じルート配下に自然に解決される。

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

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

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!SUPABASE_URL) {
    return new Response("NEXT_PUBLIC_SUPABASE_URL is not configured", { status: 500 });
  }

  const { path } = await params;
  const objectPath = path.map(encodeURIComponent).join("/");
  const targetUrl = `${SUPABASE_URL}/storage/v1/object/public/${objectPath}`;

  const headers = new Headers();
  const range = request.headers.get("range");
  if (range) headers.set("range", range);

  const upstream = await fetch(targetUrl, { headers });

  if (!upstream.ok && upstream.status !== 206) {
    return new Response("コンテンツが見つかりません", { status: upstream.status === 404 ? 404 : upstream.status });
  }

  const responseHeaders = new Headers();
  const passthroughHeaders = ["content-length", "accept-ranges", "content-range", "cache-control", "etag"];
  for (const key of passthroughHeaders) {
    const value = upstream.headers.get(key);
    if (value) responseHeaders.set(key, value);
  }
  responseHeaders.set("content-type", resolveContentType(objectPath, upstream.headers.get("content-type")));
  if (!responseHeaders.has("cache-control")) {
    responseHeaders.set("cache-control", "private, max-age=3600");
  }

  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
