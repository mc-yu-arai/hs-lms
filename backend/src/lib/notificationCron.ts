import cron from "node-cron";
import { getOrCreateSettings } from "../services/notificationRepository";
import { sendDueDateReminders } from "../services/notificationService";

// 毎分チェックし、現在時刻(時:分)が設定のauto_send_timeと一致した回だけ実行する。
// これによりTIME型で分単位まで指定できる「毎日指定時刻」を、cronの構文を動的に
// 書き換えることなく実現している(設定変更時にcronジョブの再登録が不要)。
export function startNotificationCron() {
  cron.schedule("* * * * *", async () => {
    try {
      const settings = await getOrCreateSettings();
      if (!settings.is_enabled) return;

      const now = new Date();
      const [settingHour, settingMinute] = settings.auto_send_time.split(":").map(Number);
      if (now.getHours() !== settingHour || now.getMinutes() !== settingMinute) return;

      const result = await sendDueDateReminders();
      console.log(`[notification-cron] due date reminders: sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`);
    } catch (err) {
      console.error("[notification-cron] failed:", err);
    }
  });
}
