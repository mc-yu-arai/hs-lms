import { supabaseAdmin } from "../lib/supabase";
import { HttpError } from "../middleware/errorHandler";

export interface AppUser {
  id: string;
  email: string;
  last_name: string;
  first_name: string;
  role: "learner" | "admin" | "super_admin";
  department: string | null;
  hire_date: string | null;
  is_active: boolean;
  last_login_at: string | null;
  totp_secret: string | null;
  totp_enabled: boolean;
  failed_login_count: number;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
}

export async function findUserByEmail(email: string): Promise<AppUser | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (error) throw error;
  return data as AppUser | null;
}

export async function findUserById(id: string): Promise<AppUser | null> {
  const { data, error } = await supabaseAdmin.from("users").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as AppUser | null;
}

export async function recordFailedLogin(userId: string, maxAttempts: number, lockMinutes: number) {
  const user = await findUserById(userId);
  if (!user) return;

  const nextCount = user.failed_login_count + 1;
  const shouldLock = nextCount >= maxAttempts;

  const { error } = await supabaseAdmin
    .from("users")
    .update({
      failed_login_count: shouldLock ? 0 : nextCount,
      locked_until: shouldLock ? new Date(Date.now() + lockMinutes * 60_000).toISOString() : user.locked_until,
    })
    .eq("id", userId);

  if (error) throw error;
}

export async function resetFailedLoginCount(userId: string) {
  const { error } = await supabaseAdmin.from("users").update({ failed_login_count: 0, locked_until: null }).eq("id", userId);
  if (error) throw error;
}

export async function touchLastLogin(userId: string) {
  const { error } = await supabaseAdmin
    .from("users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw error;
}

// 2FAセットアップの1段階目：QRコード提示用にシークレットを保存する（この時点ではtotp_enabledはfalseのまま）
export async function saveTotpSecret(userId: string, encryptedSecret: string) {
  const { error } = await supabaseAdmin
    .from("users")
    .update({ totp_secret: encryptedSecret, totp_enabled: false })
    .eq("id", userId);
  if (error) throw error;
}

// 2FAセットアップの2段階目：TOTPコード検証後に有効化する
export async function enableTotp(userId: string) {
  const { error } = await supabaseAdmin.from("users").update({ totp_enabled: true }).eq("id", userId);
  if (error) throw error;
}

export interface UserProfileUpdate {
  last_name?: string;
  first_name?: string;
  department?: string | null;
}

export async function updateProfile(userId: string, patch: UserProfileUpdate) {
  const { data, error } = await supabaseAdmin.from("users").update(patch).eq("id", userId).select("*").maybeSingle();
  if (error) throw error;
  return data as AppUser | null;
}

// Supabase Auth側のメール確認リンクがクリックされてauth.users.emailが変わった際に、
// public.users.emailを追いつかせる（Webhookを構築しない簡易な同期方式）
export async function syncEmail(userId: string, newEmail: string) {
  const { error } = await supabaseAdmin.from("users").update({ email: newEmail }).eq("id", userId);
  if (error) throw error;
}

export interface ListUsersFilters {
  keyword?: string;
  role?: AppUser["role"];
  isActive?: boolean;
}

export async function listUsers(filters: ListUsersFilters): Promise<AppUser[]> {
  let query = supabaseAdmin.from("users").select("*").order("created_at", { ascending: false });

  if (filters.role) query = query.eq("role", filters.role);
  if (filters.isActive !== undefined) query = query.eq("is_active", filters.isActive);
  if (filters.keyword) query = query.ilike("email", `%${filters.keyword}%`);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AppUser[];
}

export interface AdminUserUpdate {
  role?: AppUser["role"];
  isActive?: boolean;
  lastName?: string;
  firstName?: string;
  department?: string | null;
  hireDate?: string | null;
  email?: string;
}

export async function updateUserAsAdmin(userId: string, patch: AdminUserUpdate): Promise<AppUser | null> {
  const row: Record<string, unknown> = {};
  if (patch.role !== undefined) row.role = patch.role;
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  if (patch.lastName !== undefined) row.last_name = patch.lastName;
  if (patch.firstName !== undefined) row.first_name = patch.firstName;
  if (patch.department !== undefined) row.department = patch.department;
  if (patch.hireDate !== undefined) row.hire_date = patch.hireDate;
  if (patch.email !== undefined) row.email = patch.email;

  const { data, error } = await supabaseAdmin.from("users").update(row).eq("id", userId).select("*").maybeSingle();
  if (error) throw error;
  return data as AppUser | null;
}

// 管理者によるメールアドレス変更は、本人による変更（requestEmailChange/確認メール方式）と異なり、
// service_role権限でSupabase Auth側のemailを即時・直接更新する（確認メールを挟まない）。
export async function updateAuthEmailAsAdmin(userId: string, newEmail: string): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    email: newEmail,
    email_confirm: true,
  });
  if (error) {
    throw new HttpError(400, "email_update_failed", error.message ?? "メールアドレスの更新に失敗しました");
  }
}

export function toPublicProfile(user: AppUser, avatarUrl: string | null = null) {
  return {
    id: user.id,
    email: user.email,
    lastName: user.last_name,
    firstName: user.first_name,
    role: user.role,
    department: user.department,
    hireDate: user.hire_date,
    isActive: user.is_active,
    lastLoginAt: user.last_login_at,
    totpEnabled: user.totp_enabled,
    avatarUrl,
  };
}
