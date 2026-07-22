import crypto from "node:crypto";
import { supabaseAdmin } from "../lib/supabase";

const BUCKET = "videos";

const EXTENSION_MIME_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
};

export class LessonVideoError extends Error {}

export interface LessonVideoUploadResult {
  contentUrl: string;
}

function extensionOf(filename: string): string | null {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : null;
}

export function isSupportedVideoFile(filename: string): boolean {
  const ext = extensionOf(filename);
  return ext !== null && ext in EXTENSION_MIME_TYPES;
}

// 動画は同一オリジンプロキシを経由せず、Supabase Storageの公開URLをそのままlessons.content_urlに格納する
// （レッスン視聴画面の<video>タグがlesson.contentUrlを直接srcに使う既存実装に合わせるため）
export async function uploadLessonVideo(buffer: Buffer, originalFilename: string): Promise<LessonVideoUploadResult> {
  const ext = extensionOf(originalFilename);
  if (!ext || !(ext in EXTENSION_MIME_TYPES)) {
    throw new LessonVideoError("MP4・MOV・AVI形式の動画ファイルを指定してください");
  }

  const objectPath = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(objectPath, buffer, {
    contentType: EXTENSION_MIME_TYPES[ext],
    upsert: true,
  });
  if (error) throw error;

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(objectPath);
  return { contentUrl: data.publicUrl };
}
