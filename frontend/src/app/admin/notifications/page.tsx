"use client";

import { useEffect, useState } from "react";
import { useRequireAdmin } from "@/lib/use-require-admin";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import type { NotificationLog, NotificationSettings, NotificationType, SendRemindersResult } from "@/lib/types";
import { AdminHeader } from "../AdminHeader";

const TYPE_LABEL: Record<NotificationType, string> = {
  enrollment_completed: "受講登録完了",
  course_completed: "コース修了",
  due_date_reminder: "期限リマインダー",
};

export default function AdminNotificationsPage() {
  const { user, isLoading, isAuthorized } = useRequireAdmin();
  const { authFetch } = useAuth();

  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [reminderDaysBefore, setReminderDaysBefore] = useState("7");
  const [autoSendTime, setAutoSendTime] = useState("09:00");
  const [isEnabled, setIsEnabled] = useState(true);

  const [logs, setLogs] = useState<NotificationLog[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<SendRemindersResult | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  function loadLogs() {
    authFetch<{ logs: NotificationLog[] }>("/v1/admin/notifications/logs")
      .then((res) => setLogs(res.logs))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "送信履歴の取得に失敗しました"));
  }

  useEffect(() => {
    if (!isAuthorized) return;
    authFetch<{ settings: NotificationSettings }>("/v1/admin/notification-settings")
      .then((res) => {
        setSettings(res.settings);
        setReminderDaysBefore(String(res.settings.reminderDaysBefore));
        setAutoSendTime(res.settings.autoSendTime.slice(0, 5));
        setIsEnabled(res.settings.isEnabled);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "通知設定の取得に失敗しました"));
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthorized]);

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);
    setIsSaving(true);
    try {
      const res = await authFetch<{ settings: NotificationSettings }>("/v1/admin/notification-settings", {
        method: "PUT",
        body: {
          reminderDaysBefore: Number(reminderDaysBefore),
          autoSendTime,
          isEnabled,
        },
      });
      setSettings(res.settings);
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "設定の保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSendNow() {
    setSendError(null);
    setSendResult(null);
    setIsSending(true);
    try {
      const res = await authFetch<{ result: SendRemindersResult }>("/v1/admin/notifications/send-reminders", { method: "POST" });
      setSendResult(res.result);
      loadLogs();
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : "リマインダー送信に失敗しました");
    } finally {
      setIsSending(false);
    }
  }

  if (isLoading || !user || !isAuthorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">読み込み中...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <AdminHeader />
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h2 className="mb-6 text-lg font-bold text-gray-900">通知・リマインダー</h2>

        {loadError && (
          <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {loadError}
          </p>
        )}

        <section className="mb-6 rounded-xl bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-base font-semibold text-gray-900">通知設定</h3>
          {!settings ? (
            <p className="text-sm text-gray-500">読み込み中...</p>
          ) : (
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block text-gray-700">リマインダー送信日数（期限の何日前に送るか）</span>
                <input
                  type="number"
                  min={1}
                  max={90}
                  required
                  value={reminderDaysBefore}
                  onChange={(e) => setReminderDaysBefore(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-gray-700">自動送信時刻</span>
                <input
                  type="time"
                  required
                  value={autoSendTime}
                  onChange={(e) => setAutoSendTime(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} className="h-4 w-4" />
                通知を有効にする
              </label>

              {saveError && (
                <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  {saveError}
                </p>
              )}
              {saveSuccess && (
                <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                  保存しました。
                </p>
              )}

              <button
                type="submit"
                disabled={isSaving}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving ? "保存中..." : "設定を保存する"}
              </button>
            </form>
          )}
        </section>

        <section className="mb-6 rounded-xl bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-base font-semibold text-gray-900">リマインダーの手動送信</h3>
          <p className="mb-4 text-sm text-gray-600">
            設定されている送信日数以内に受講期限を迎える未修了の受講登録に対して、今すぐリマインダーメールを送信します。
          </p>
          {sendError && (
            <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {sendError}
            </p>
          )}
          {sendResult && (
            <p role="status" className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              送信完了: 送信{sendResult.sent}件 / スキップ{sendResult.skipped}件 / 失敗{sendResult.failed}件
            </p>
          )}
          <button
            onClick={handleSendNow}
            disabled={isSending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {isSending ? "送信中..." : "今すぐリマインダーを送信する"}
          </button>
        </section>

        <section className="rounded-xl bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-base font-semibold text-gray-900">送信履歴</h3>
          {logs === null && !loadError && <p className="text-sm text-gray-500">読み込み中...</p>}
          {logs !== null && logs.length === 0 && <p className="text-sm text-gray-500">送信履歴はまだありません。</p>}
          {logs !== null && logs.length > 0 && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-400">
                  <th className="py-2 font-medium">送信日時</th>
                  <th className="py-2 font-medium">受講者</th>
                  <th className="py-2 font-medium">コース</th>
                  <th className="py-2 font-medium">種別</th>
                  <th className="py-2 font-medium">結果</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 text-gray-700">{new Date(log.sentAt).toLocaleString("ja-JP")}</td>
                    <td className="py-2 text-gray-700">{log.learnerName}</td>
                    <td className="py-2 text-gray-700">{log.courseTitle}</td>
                    <td className="py-2 text-gray-700">{TYPE_LABEL[log.notificationType]}</td>
                    <td className="py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          log.isSuccess ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                        }`}
                        title={log.errorMessage ?? undefined}
                      >
                        {log.isSuccess ? "成功" : "失敗"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
