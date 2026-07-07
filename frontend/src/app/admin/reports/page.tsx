"use client";

import { useEffect, useState } from "react";
import { useRequireAdmin } from "@/lib/use-require-admin";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import type { CourseReportRow, UserProgressReportRow } from "@/lib/types";
import { AdminHeader } from "../AdminHeader";

type Tab = "users" | "courses";

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 100) / 100;
}

export default function AdminReportsPage() {
  const { user, isLoading, isAuthorized } = useRequireAdmin();
  const { authFetch, authFetchBlob } = useAuth();

  const [tab, setTab] = useState<Tab>("users");
  const [userRows, setUserRows] = useState<UserProgressReportRow[] | null>(null);
  const [courseRows, setCourseRows] = useState<CourseReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthorized) return;
    Promise.all([
      authFetch<{ users: UserProgressReportRow[] }>("/v1/reports/users"),
      authFetch<{ courses: CourseReportRow[] }>("/v1/reports/courses"),
    ])
      .then(([usersRes, coursesRes]) => {
        setUserRows(usersRes.users);
        setCourseRows(coursesRes.courses);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "レポートの取得に失敗しました"));
  }, [isAuthorized, authFetch]);

  async function handleDownloadCsv(path: string, filename: string) {
    setDownloadError(null);
    setIsDownloading(true);
    try {
      const blob = await authFetchBlob(path);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err instanceof ApiError ? err.message : "CSVのダウンロードに失敗しました");
    } finally {
      setIsDownloading(false);
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
      <div className="mx-auto max-w-5xl px-4 py-8">
        <h2 className="mb-6 text-lg font-bold text-gray-900">レポート</h2>

        <div className="mb-6 flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setTab("users")}
            className={`px-4 py-2 text-sm font-medium ${tab === "users" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}
          >
            受講者別進捗
          </button>
          <button
            onClick={() => setTab("courses")}
            className={`px-4 py-2 text-sm font-medium ${tab === "courses" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}
          >
            コース別集計
          </button>
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {downloadError && (
          <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {downloadError}
          </p>
        )}

        {tab === "users" && (
          <section>
            {userRows === null && !error ? (
              <p className="text-sm text-gray-500">読み込み中...</p>
            ) : (
              userRows && (
                <>
                  <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-xl bg-white p-5 shadow-sm">
                      <p className="text-xs text-gray-400">対象ユーザー数</p>
                      <p className="mt-1 text-2xl font-bold text-gray-900">{userRows.length}</p>
                    </div>
                    <div className="rounded-xl bg-white p-5 shadow-sm">
                      <p className="text-xs text-gray-400">修了済み延べ数</p>
                      <p className="mt-1 text-2xl font-bold text-gray-900">{userRows.reduce((sum, r) => sum + r.completedCount, 0)}</p>
                    </div>
                    <div className="rounded-xl bg-white p-5 shadow-sm">
                      <p className="text-xs text-gray-400">平均進捗率</p>
                      <p className="mt-1 text-2xl font-bold text-gray-900">{average(userRows.map((r) => r.averageProgressRate))}%</p>
                    </div>
                  </div>

                  <div className="mb-4 flex justify-end">
                    <button
                      onClick={() => handleDownloadCsv("/v1/reports/users/csv", "users_report.csv")}
                      disabled={isDownloading}
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                      CSVダウンロード
                    </button>
                  </div>

                  <div className="overflow-hidden rounded-xl bg-white shadow-sm">
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
                        {userRows.map((row) => (
                          <tr key={row.userId} className="border-b border-gray-100 last:border-0">
                            <td className="px-4 py-3 text-gray-900">
                              {row.lastName} {row.firstName}
                            </td>
                            <td className="px-4 py-3 text-gray-600">{row.department ?? "-"}</td>
                            <td className="px-4 py-3 text-gray-600">{row.courseCount}</td>
                            <td className="px-4 py-3 text-gray-600">{row.completedCount}</td>
                            <td className="px-4 py-3 text-gray-600">{row.averageProgressRate}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            )}
          </section>
        )}

        {tab === "courses" && (
          <section>
            {courseRows === null && !error ? (
              <p className="text-sm text-gray-500">読み込み中...</p>
            ) : (
              courseRows && (
                <>
                  <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-xl bg-white p-5 shadow-sm">
                      <p className="text-xs text-gray-400">対象コース数</p>
                      <p className="mt-1 text-2xl font-bold text-gray-900">{courseRows.length}</p>
                    </div>
                    <div className="rounded-xl bg-white p-5 shadow-sm">
                      <p className="text-xs text-gray-400">総受講者数（延べ）</p>
                      <p className="mt-1 text-2xl font-bold text-gray-900">{courseRows.reduce((sum, r) => sum + r.enrolledCount, 0)}</p>
                    </div>
                    <div className="rounded-xl bg-white p-5 shadow-sm">
                      <p className="text-xs text-gray-400">平均修了率</p>
                      <p className="mt-1 text-2xl font-bold text-gray-900">{average(courseRows.map((r) => r.completionRate))}%</p>
                    </div>
                  </div>

                  <div className="mb-4 flex justify-end">
                    <button
                      onClick={() => handleDownloadCsv("/v1/reports/courses/csv", "courses_report.csv")}
                      disabled={isDownloading}
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                      CSVダウンロード
                    </button>
                  </div>

                  <div className="overflow-hidden rounded-xl bg-white shadow-sm">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-xs text-gray-400">
                          <th className="px-4 py-3 font-medium">コース名</th>
                          <th className="px-4 py-3 font-medium">受講者数</th>
                          <th className="px-4 py-3 font-medium">修了者数</th>
                          <th className="px-4 py-3 font-medium">修了率</th>
                          <th className="px-4 py-3 font-medium">平均進捗率</th>
                        </tr>
                      </thead>
                      <tbody>
                        {courseRows.map((row) => (
                          <tr key={row.courseId} className="border-b border-gray-100 last:border-0">
                            <td className="px-4 py-3 text-gray-900">{row.title}</td>
                            <td className="px-4 py-3 text-gray-600">{row.enrolledCount}</td>
                            <td className="px-4 py-3 text-gray-600">{row.completedCount}</td>
                            <td className="px-4 py-3 text-gray-600">{row.completionRate}%</td>
                            <td className="px-4 py-3 text-gray-600">{row.averageProgressRate}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            )}
          </section>
        )}
      </div>
    </main>
  );
}
