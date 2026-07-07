import { supabaseAdmin } from "../lib/supabase";
import { sendEmail } from "../lib/resend";
import { getCourseById } from "./courseRepository";
import { findUserById } from "./userRepository";
import {
  recordNotification,
  hasSuccessfulNotification,
  getOrCreateSettings,
  listNotificationLogs,
  type NotificationType,
} from "./notificationRepository";

async function sendAndLog(userId: string, courseId: string, type: NotificationType, to: string, subject: string, html: string) {
  try {
    await sendEmail(to, subject, html);
    await recordNotification(userId, courseId, type, true);
  } catch (err) {
    await recordNotification(userId, courseId, type, false, err instanceof Error ? err.message : String(err));
  }
}

export async function notifyEnrollmentCompleted(userId: string, courseId: string): Promise<void> {
  const [user, course] = await Promise.all([findUserById(userId), getCourseById(courseId)]);
  if (!user || !course) return;

  await sendAndLog(
    userId,
    courseId,
    "enrollment_completed",
    user.email,
    `【HS-LMS】受講登録が完了しました: ${course.title}`,
    `<p>${user.last_name} ${user.first_name} 様</p><p>「${course.title}」の受講登録が完了しました。学習を開始してください。</p>`,
  );
}

export async function notifyCourseCompleted(userId: string, courseId: string): Promise<void> {
  const [user, course] = await Promise.all([findUserById(userId), getCourseById(courseId)]);
  if (!user || !course) return;

  await sendAndLog(
    userId,
    courseId,
    "course_completed",
    user.email,
    `【HS-LMS】コースを修了しました: ${course.title}`,
    `<p>${user.last_name} ${user.first_name} 様</p><p>「${course.title}」を修了しました。お疲れ様でした。</p>`,
  );
}

export interface ReminderResult {
  sent: number;
  skipped: number;
  failed: number;
}

// 「due_date - reminder_days_before 日」ちょうどではなく、今日から reminder_days_before 日後までの
// 幅を持たせて対象を拾う(cronが1日実行を逃しても取りこぼさないようにするため)。
// 実際の重複送信防止は notification_logs の成功済みチェック(hasSuccessfulNotification)で行う。
export async function sendDueDateReminders(): Promise<ReminderResult> {
  const settings = await getOrCreateSettings();
  const result: ReminderResult = { sent: 0, skipped: 0, failed: 0 };
  if (!settings.is_enabled) return result;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + settings.reminder_days_before);

  const { data: enrollments, error } = await supabaseAdmin.from("enrollments").select("*");
  if (error) throw error;

  const candidates = (enrollments ?? []).filter((e) => {
    if (e.status === "completed" || !e.due_date) return false;
    const dueDate = new Date(e.due_date);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate >= today && dueDate <= windowEnd;
  });

  for (const enrollment of candidates) {
    const alreadySent = await hasSuccessfulNotification(enrollment.user_id, enrollment.course_id, "due_date_reminder");
    if (alreadySent) {
      result.skipped++;
      continue;
    }

    const [user, course] = await Promise.all([findUserById(enrollment.user_id), getCourseById(enrollment.course_id)]);
    if (!user || !course) {
      result.skipped++;
      continue;
    }

    try {
      await sendEmail(
        user.email,
        `【HS-LMS】受講期限が近づいています: ${course.title}`,
        `<p>${user.last_name} ${user.first_name} 様</p><p>「${course.title}」の受講期限は${enrollment.due_date}です。お早めに受講を完了してください。</p>`,
      );
      await recordNotification(enrollment.user_id, enrollment.course_id, "due_date_reminder", true);
      result.sent++;
    } catch (err) {
      await recordNotification(
        enrollment.user_id,
        enrollment.course_id,
        "due_date_reminder",
        false,
        err instanceof Error ? err.message : String(err),
      );
      result.failed++;
    }
  }

  return result;
}

export interface EnrichedNotificationLog {
  id: string;
  learnerName: string;
  courseTitle: string;
  notificationType: NotificationType;
  isSuccess: boolean;
  errorMessage: string | null;
  sentAt: string;
}

export async function getEnrichedNotificationLogs(): Promise<EnrichedNotificationLog[]> {
  const logs = await listNotificationLogs();
  if (logs.length === 0) return [];

  const userIds = [...new Set(logs.map((l) => l.user_id))];
  const courseIds = [...new Set(logs.map((l) => l.course_id))];

  const [{ data: users, error: userError }, { data: courses, error: courseError }] = await Promise.all([
    supabaseAdmin.from("users").select("*").in("id", userIds),
    supabaseAdmin.from("courses").select("*").in("id", courseIds),
  ]);
  if (userError) throw userError;
  if (courseError) throw courseError;

  const userById = new Map((users ?? []).map((u) => [u.id, u]));
  const courseById = new Map((courses ?? []).map((c) => [c.id, c]));

  return logs.map((log) => {
    const user = userById.get(log.user_id);
    const course = courseById.get(log.course_id);
    return {
      id: log.id,
      learnerName: user ? `${user.last_name} ${user.first_name}` : "(不明なユーザー)",
      courseTitle: course?.title ?? "(不明なコース)",
      notificationType: log.notification_type,
      isSuccess: log.is_success,
      errorMessage: log.error_message,
      sentAt: log.sent_at,
    };
  });
}
