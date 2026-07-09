import { supabaseAdmin } from "../lib/supabase";

const BUCKET = "avatars";
const EXTENSIONS = ["jpg", "png"] as const;

export function mimeToExtension(mimetype: string): "jpg" | "png" | null {
  if (mimetype === "image/jpeg") return "jpg";
  if (mimetype === "image/png") return "png";
  return null;
}

export async function uploadAvatar(userId: string, buffer: Buffer, mimetype: string): Promise<string> {
  const ext = mimeToExtension(mimetype);
  if (!ext) throw new Error("unsupported mimetype");

  const path = `${userId}/avatar.${ext}`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimetype,
    upsert: true,
  });
  if (error) throw error;

  // 拡張子を変えて再アップロードした場合に古いファイルが残らないようにする
  const otherExt = ext === "jpg" ? "png" : "jpg";
  await supabaseAdmin.storage.from(BUCKET).remove([`${userId}/avatar.${otherExt}`]);

  return supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function deleteAvatar(userId: string): Promise<void> {
  const { error } = await supabaseAdmin.storage.from(BUCKET).remove(EXTENSIONS.map((ext) => `${userId}/avatar.${ext}`));
  if (error) throw error;
}

export async function findAvatarUrl(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(userId);
  if (error || !data) return null;

  const found = data.find((f) => EXTENSIONS.some((ext) => f.name === `avatar.${ext}`));
  if (!found) return null;

  return supabaseAdmin.storage.from(BUCKET).getPublicUrl(`${userId}/${found.name}`).data.publicUrl;
}
