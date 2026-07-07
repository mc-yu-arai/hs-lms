-- 0006: 通知・リマインダー機能ブロック(NotificationSettings/NotificationLog)
-- notification_settingsはシングルトン運用(1行のみ。無ければアプリ側でデフォルト行を自動作成)。
-- notification_logsのcourse_idは、3種類の通知(受講登録完了/コース修了/期限切れリマインダー)が
-- いずれもコースに紐づくためNOT NULL。

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_days_before INTEGER NOT NULL DEFAULT 7,
  auto_send_time TIME NOT NULL DEFAULT '09:00:00',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id),
  course_id UUID NOT NULL REFERENCES public.courses(id),
  notification_type VARCHAR(30) NOT NULL CHECK (notification_type IN ('enrollment_completed', 'course_completed', 'due_date_reminder')),
  is_success BOOLEAN NOT NULL,
  error_message TEXT,
  sent_at TIMESTAMP NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_notification_settings_set_updated_at ON public.notification_settings;
CREATE TRIGGER trg_notification_settings_set_updated_at BEFORE UPDATE ON public.notification_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;
