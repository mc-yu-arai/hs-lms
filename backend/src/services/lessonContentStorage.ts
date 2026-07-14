import crypto from "node:crypto";
import AdmZip from "adm-zip";
import mime from "mime-types";
import { supabaseAdmin } from "../lib/supabase";

const BUCKET = "lesson-content";

export type UploadedContentType = "scorm" | "learnwiz";
export type ScormVersion = "1.2" | "2004";

export class LessonContentError extends Error {}

export interface LessonContentUploadResult {
  contentUrl: string;
  contentType: UploadedContentType;
  scormVersion: ScormVersion | null;
}

function normalizePath(entryName: string): string {
  return entryName.replace(/\\/g, "/");
}

function depthOf(path: string): number {
  return path.split("/").length;
}

// 破損したzipエントリの展開失敗(zlibエラー)はクライアント側の入力不備として400を返したいため、
// ここで捕捉してLessonContentErrorに変換する
function safeGetData(entry: AdmZip.IZipEntry): Buffer {
  try {
    return entry.getData();
  } catch {
    throw new LessonContentError(`zipの展開に失敗しました（破損している可能性があります）: ${entry.entryName}`);
  }
}

// imsmanifest.xml / lwConfig.xml の有無でSCORM/LearnWizを判定する（zip内のどの階層にあってもよい）
function detectContentType(entries: AdmZip.IZipEntry[]): { contentType: UploadedContentType; manifestEntry: AdmZip.IZipEntry | null } {
  const manifest = entries.find((e) => normalizePath(e.entryName).toLowerCase().endsWith("imsmanifest.xml"));
  if (manifest) return { contentType: "scorm", manifestEntry: manifest };

  const lwConfig = entries.find((e) => normalizePath(e.entryName).toLowerCase().endsWith("lwconfig.xml"));
  if (lwConfig) return { contentType: "learnwiz", manifestEntry: null };

  throw new LessonContentError(
    "コンテンツ種別を判定できませんでした（imsmanifest.xmlまたはlwConfig.xmlが見つかりません）",
  );
}

// <schemaversion>の値が"1.2"始まりならSCORM 1.2、それ以外(2004 3rd Edition等)は2004として扱う簡易判定
function detectScormVersion(manifestEntry: AdmZip.IZipEntry): ScormVersion {
  const xml = safeGetData(manifestEntry).toString("utf-8");
  const match = xml.match(/<schemaversion>\s*([^<]+)\s*<\/schemaversion>/i);
  const value = match?.[1]?.trim() ?? "";
  return value.startsWith("1.2") ? "1.2" : "2004";
}

// トップレベル（パス階層が浅い方）優先でindex.htmlを探す。複数SCO構成のマニフェスト解析はスコープ外
function findEntryPoint(entries: AdmZip.IZipEntry[]): AdmZip.IZipEntry {
  const candidates = entries
    .filter((e) => normalizePath(e.entryName).toLowerCase().endsWith("index.html"))
    .sort((a, b) => depthOf(normalizePath(a.entryName)) - depthOf(normalizePath(b.entryName)));

  const entryPoint = candidates[0];
  if (!entryPoint) {
    throw new LessonContentError("index.htmlが見つかりませんでした");
  }
  return entryPoint;
}

export async function extractAndUploadLessonContent(zipBuffer: Buffer): Promise<LessonContentUploadResult> {
  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch {
    throw new LessonContentError("zipファイルを読み込めませんでした");
  }

  const entries = zip.getEntries().filter((e) => !e.isDirectory);
  if (entries.length === 0) {
    throw new LessonContentError("zipファイルが空です");
  }

  const { contentType, manifestEntry } = detectContentType(entries);
  const scormVersion = contentType === "scorm" && manifestEntry ? detectScormVersion(manifestEntry) : null;
  const entryPoint = findEntryPoint(entries);

  const uploadId = crypto.randomUUID();

  for (const entry of entries) {
    const objectPath = `${uploadId}/${normalizePath(entry.entryName)}`;
    const contentTypeHeader = mime.lookup(entry.entryName) || "application/octet-stream";
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(objectPath, safeGetData(entry), {
      contentType: contentTypeHeader,
      upsert: true,
    });
    if (error) throw error;
  }

  return {
    contentUrl: `${BUCKET}/${uploadId}/${normalizePath(entryPoint.entryName)}`,
    contentType,
    scormVersion,
  };
}
