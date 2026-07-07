import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/requireAuth";
import { getOrCreateSettings, updateSettings, type NotificationSettings } from "../services/notificationRepository";
import { sendDueDateReminders, getEnrichedNotificationLogs } from "../services/notificationService";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth(), requireRole("admin", "super_admin"));

function serializeSettings(settings: NotificationSettings) {
  return {
    reminderDaysBefore: settings.reminder_days_before,
    autoSendTime: settings.auto_send_time,
    isEnabled: settings.is_enabled,
    updatedAt: settings.updated_at,
  };
}

notificationsRouter.get(
  "/notification-settings",
  asyncHandler(async (_req, res) => {
    const settings = await getOrCreateSettings();
    return res.status(200).json({ settings: serializeSettings(settings) });
  }),
);

const updateSettingsSchema = z.object({
  reminderDaysBefore: z.number().int().min(1).max(90).optional(),
  autoSendTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, "HH:MM形式で指定してください")
    .optional(),
  isEnabled: z.boolean().optional(),
});

notificationsRouter.put(
  "/notification-settings",
  asyncHandler(async (req, res) => {
    const input = updateSettingsSchema.parse(req.body);
    const settings = await updateSettings(input);
    return res.status(200).json({ settings: serializeSettings(settings) });
  }),
);

notificationsRouter.post(
  "/notifications/send-reminders",
  asyncHandler(async (_req, res) => {
    const result = await sendDueDateReminders();
    return res.status(200).json({ result });
  }),
);

notificationsRouter.get(
  "/notifications/logs",
  asyncHandler(async (_req, res) => {
    const logs = await getEnrichedNotificationLogs();
    return res.status(200).json({ logs });
  }),
);
