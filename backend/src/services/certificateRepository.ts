import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/supabase";

export interface Certificate {
  id: string;
  user_id: string;
  course_id: string;
  issued_at: string;
  verification_uuid: string;
}

export async function findCertificate(userId: string, courseId: string): Promise<Certificate | null> {
  const { data, error } = await supabaseAdmin
    .from("certificates")
    .select("*")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (error) throw error;
  return data as Certificate | null;
}

export async function findCertificateByVerificationUuid(uuid: string): Promise<Certificate | null> {
  const { data, error } = await supabaseAdmin.from("certificates").select("*").eq("verification_uuid", uuid).maybeSingle();
  if (error) throw error;
  return data as Certificate | null;
}

// UNIQUE(user_id, course_id)制約により冪等。同時リクエストでinsertが競合した場合は
// 既存行を再取得して返す(発行APIを何度呼んでも同じ修了証が返る設計)。
export async function findOrCreateCertificate(userId: string, courseId: string): Promise<{ certificate: Certificate; created: boolean }> {
  const existing = await findCertificate(userId, courseId);
  if (existing) return { certificate: existing, created: false };

  const { data, error } = await supabaseAdmin
    .from("certificates")
    .insert({ user_id: userId, course_id: courseId, verification_uuid: randomUUID() })
    .select("*")
    .single();

  if (error) {
    const raceExisting = await findCertificate(userId, courseId);
    if (raceExisting) return { certificate: raceExisting, created: false };
    throw error;
  }

  return { certificate: data as Certificate, created: true };
}
