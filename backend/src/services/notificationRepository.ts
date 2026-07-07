import { supabaseAdmin } from "../lib/supabase";

export type NotificationType = "enrollment_completed" | "course_completed" | "due_date_reminder";

export interface NotificationSettings {
  id: string;
  reminder_days_before: number;
  auto_send_time: string;
  is_enabled: boolean;
  updated_at: string;
}

export interface NotificationLog {
  id: string;
  user_id: string;
  course_id: string;
  notification_type: NotificationType;
  is_success: boolean;
  error_message: string | null;
  sent_at: string;
}

const DEFAULT_SETTINGS = { reminder_days_before: 7, auto_send_time: "09:00:00", is_enabled: true };

// notification_settingsはシングルトン運用。存在しなければデフォルト値で1行だけ作成する
export async function getOrCreateSettings(): Promise<NotificationSettings> {
  const { data: existing, error } = await supabaseAdmin.from("notification_settings").select("*").maybeSingle();
  if (error) throw error;
  if (existing) return existing as NotificationSettings;

  const { data: created, error: insertError } = await supabaseAdmin
    .from("notification_settings")
    .insert(DEFAULT_SETTINGS)
    .select("*")
    .single();
  if (insertError) throw insertError;
  return created as NotificationSettings;
}

export interface NotificationSettingsUpdate {
  reminderDaysBefore?: number;
  autoSendTime?: string;
  isEnabled?: boolean;
}

export async function updateSettings(patch: NotificationSettingsUpdate): Promise<NotificationSettings> {
  const current = await getOrCreateSettings();

  const row: Record<string, unknown> = {};
  if (patch.reminderDaysBefore !== undefined) row.reminder_days_before = patch.reminderDaysBefore;
  if (patch.autoSendTime !== undefined) row.auto_send_time = patch.autoSendTime;
  if (patch.isEnabled !== undefined) row.is_enabled = patch.isEnabled;

  if (Object.keys(row).length === 0) return current;

  const { data, error } = await supabaseAdmin.from("notification_settings").update(row).eq("id", current.id).select("*").single();
  if (error) throw error;
  return data as NotificationSettings;
}

export async function recordNotification(
  userId: string,
  courseId: string,
  type: NotificationType,
  isSuccess: boolean,
  errorMessage: string | null = null,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("notification_logs")
    .insert({ user_id: userId, course_id: courseId, notification_type: type, is_success: isSuccess, error_message: errorMessage });
  if (error) throw error;
}

export async function hasSuccessfulNotification(userId: string, courseId: string, type: NotificationType): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("notification_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .eq("notification_type", type)
    .eq("is_success", true)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

export async function listNotificationLogs(): Promise<NotificationLog[]> {
  const { data, error } = await supabaseAdmin.from("notification_logs").select("*").order("sent_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as NotificationLog[];
}
