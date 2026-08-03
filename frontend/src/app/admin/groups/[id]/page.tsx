"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRequireAdmin } from "@/lib/use-require-admin";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import type { AuthUser, Course, GroupDetail, GroupProgressReport } from "@/lib/types";
import { AdminHeader } from "../../AdminHeader";

const LEVEL_LABEL: Record<Course["level"], string> = {
  beginner: "初級",
  intermediate: "中級",
  advanced: "上級",
};

export default function AdminGroupDetailPage() {
  const params = useParams<{ id: string }>();
  const groupId = params.id;
  const { user, isLoading, isAuthorized } = useRequireAdmin();
  const { authFetch, authFetchBlob } = useAuth();

  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [allUsers, setAllUsers] = useState<AuthUser[] | null>(null);
  const [allCourses, setAllCourses] = useState<Course[] | null>(null);
  const [report, setReport] = useState<GroupProgressReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [downloadError, setDownloadError] = useState<string | null>(null);

  function loadDetail() {
    authFetch<GroupDetail>(`/v1/groups/${groupId}`)
      .then((res) => {
        setDetail(res);
        setName(res.group.name);
        setDescription(res.group.description ?? "");
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "グループ情報の取得に失敗しました"));
  }

  function loadReport() {
    authFetch<{ report: GroupProgressReport }>(`/v1/reports/groups/${groupId}`)
      .then((res) => setReport(res.report))
      .catch((err) => setError(err instanceof ApiError ? err.message : "レポートの取得に失敗しました"));
  }

  useEffect(() => {
    if (!isAuthorized) return;
    loadDetail();
    loadReport();
    authFetch<{ users: AuthUser[] }>("/v1/users").then((res) => setAllUsers(res.users));
    authFetch<{ courses: Course[] }>("/v1/courses").then((res) => setAllCourses(res.courses));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthorized, groupId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);
    setIsBusy(true);
    try {
      await authFetch(`/v1/groups/${groupId}`, { method: "PUT", body: { name, description: description || null } });
      setSaveSuccess(true);
      loadDetail();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "更新に失敗しました");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleAddMember(userId: string) {
    if (!userId) return;
    setIsBusy(true);
    setError(null);
    try {
      await authFetch(`/v1/groups/${groupId}/members`, { method: "POST", body: { userId } });
      loadDetail();
      loadReport();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "メンバーの追加に失敗しました");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!window.confirm("このメンバーをグループから外しますか？（受講登録・進捗はそのまま残ります）")) return;
    setIsBusy(true);
    setError(null);
    try {
      await authFetch(`/v1/groups/${groupId}/members`, { method: "DELETE", body: { userId } });
      loadDetail();
      loadReport();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "メンバーの削除に失敗しました");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleAssignCourse(courseId: string) {
    if (!courseId) return;
    setIsBusy(true);
    setError(null);
    try {
      await authFetch(`/v1/groups/${groupId}/courses`, { method: "POST", body: { courseId } });
      loadDetail();
      loadReport();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "コースの割り当てに失敗しました");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRemoveCourse(courseId: string) {
    if (!window.confirm("このコースの割り当てを解除しますか？（既存の受講登録・進捗はそのまま残ります）")) return;
    setIsBusy(true);
    setError(null);
    try {
      await authFetch(`/v1/groups/${groupId}/courses`, { method: "DELETE", body: { courseId } });
      loadDetail();
      loadReport();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "コースの割り当て解除に失敗しました");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDownloadCsv() {
    setDownloadError(null);
    try {
      const blob = await authFetchBlob(`/v1/reports/groups/${groupId}/csv`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `group_${groupId}_report.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err instanceof ApiError ? err.message : "CSVのダウンロードに失敗しました");
    }
  }

  if (isLoading || !user || !isAuthorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">読み込み中...</p>
      </main>
    );
  }

  const memberUserIds = new Set((detail?.members ?? []).map((m) => m.user.id));
  const assignedCourseIds = new Set((detail?.courses ?? []).map((c) => c.course.id));
  const availableUsers = (allUsers ?? []).filter((u) => !memberUserIds.has(u.id));
  const availableCourses = (allCourses ?? []).filter((c) => !assignedCourseIds.has(c.id));

  return (
    <main className="min-h-screen bg-gray-50">
      <AdminHeader />
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">グループ詳細</h2>
          <a href="/admin/groups" className="text-sm text-gray-500 hover:text-gray-700">
            一覧に戻る
          </a>
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {!detail ? (
          <p className="text-sm text-gray-500">読み込み中...</p>
        ) : (
          <>
            <section className="mb-6 rounded-xl bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-base font-semibold text-gray-900">基本情報</h3>
              <form onSubmit={handleSave} className="space-y-4">
                <label className="block text-sm">
                  <span className="mb-1 block text-gray-700">グループ名</span>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-gray-700">説明</span>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                {saveError && <p className="text-sm text-red-700">{saveError}</p>}
                {saveSuccess && <p className="text-sm text-green-700">保存しました。</p>}
                <button
                  type="submit"
                  disabled={isBusy}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  保存する
                </button>
              </form>
            </section>

            <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className="rounded-xl bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-base font-semibold text-gray-900">メンバー（{detail.members.length}名）</h3>
                <select
                  value=""
                  onChange={(e) => handleAddMember(e.target.value)}
                  disabled={isBusy || availableUsers.length === 0}
                  className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
                >
                  <option value="">
                    {availableUsers.length === 0 ? "追加できるユーザーがいません" : "ユーザーを選択すると追加されます..."}
                  </option>
                  {availableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.lastName} {u.firstName}（{u.email}）
                    </option>
                  ))}
                </select>
                {detail.members.length === 0 ? (
                  <p className="text-sm text-gray-500">メンバーはまだいません。</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {detail.members.map((m) => (
                      <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                        <span className="text-gray-900">
                          {m.user.lastName} {m.user.firstName}
                          <span className="ml-2 text-xs text-gray-400">{m.user.email}</span>
                        </span>
                        <button
                          onClick={() => handleRemoveMember(m.user.id)}
                          disabled={isBusy}
                          className="text-xs text-red-600 hover:underline disabled:opacity-50"
                        >
                          削除
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-xl bg-white p-6 shadow-sm">
                <h3 className="mb-1 text-base font-semibold text-gray-900">割り当てコース（{detail.courses.length}件）</h3>
                <p className="mb-4 text-xs text-gray-500">
                  コースを割り当てると、現在のメンバー全員に受講登録が自動作成されます。以後メンバーを追加すると、その時点で割り当て済みのコースにも自動で受講登録されます。
                </p>
                <select
                  value=""
                  onChange={(e) => handleAssignCourse(e.target.value)}
                  disabled={isBusy || availableCourses.length === 0}
                  className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
                >
                  <option value="">
                    {availableCourses.length === 0 ? "割り当てられるコースがありません" : "コースを選択すると割り当てられます..."}
                  </option>
                  {availableCourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                {detail.courses.length === 0 ? (
                  <p className="text-sm text-gray-500">割り当てられたコースはありません。</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {detail.courses.map((c) => (
                      <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                        <span className="text-gray-900">
                          {c.course.title}
                          <span className="ml-2 text-xs text-gray-400">{LEVEL_LABEL[c.course.level]}</span>
                        </span>
                        <button
                          onClick={() => handleRemoveCourse(c.course.id)}
                          disabled={isBusy}
                          className="text-xs text-red-600 hover:underline disabled:opacity-50"
                        >
                          解除
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <section className="rounded-xl bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900">グループ別進捗レポート</h3>
                <button
                  onClick={handleDownloadCsv}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  CSVダウンロード
                </button>
              </div>
              {downloadError && <p className="mb-4 text-sm text-red-700">{downloadError}</p>}
              {!report ? (
                <p className="text-sm text-gray-500">読み込み中...</p>
              ) : (
                <>
                  <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="rounded-xl bg-gray-50 p-5">
                      <p className="text-xs text-gray-400">メンバー数</p>
                      <p className="mt-1 text-2xl font-bold text-gray-900">{report.memberCount}</p>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-5">
                      <p className="text-xs text-gray-400">平均修了率</p>
                      <p className="mt-1 text-2xl font-bold text-gray-900">{report.averageCompletionRate}%</p>
                    </div>
                  </div>

                  {report.members.length === 0 ? (
                    <p className="text-sm text-gray-500">メンバーがいないため集計対象がありません。</p>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-gray-100">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 text-xs text-gray-400">
                            <th className="px-4 py-3 font-medium">氏名</th>
                            <th className="px-4 py-3 font-medium">部署</th>
                            <th className="px-4 py-3 font-medium">受講コース数</th>
                            <th className="px-4 py-3 font-medium">修了数</th>
                            <th className="px-4 py-3 font-medium">平均進捗率</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.members.map((m) => (
                            <tr key={m.userId} className="border-b border-gray-100 last:border-0">
                              <td className="px-4 py-3 text-gray-900">
                                {m.lastName} {m.firstName}
                              </td>
                              <td className="px-4 py-3 text-gray-600">{m.department ?? "-"}</td>
                              <td className="px-4 py-3 text-gray-600">{m.courseCount}</td>
                              <td className="px-4 py-3 text-gray-600">{m.completedCount}</td>
                              <td className="px-4 py-3 text-gray-600">{m.averageProgressRate}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
