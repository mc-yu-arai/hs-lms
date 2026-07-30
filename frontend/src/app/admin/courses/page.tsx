"use client";

import { useEffect, useState } from "react";
import { useRequireAdmin } from "@/lib/use-require-admin";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import type { Course } from "@/lib/types";
import { AdminHeader } from "../AdminHeader";

const LEVEL_LABEL: Record<Course["level"], string> = {
  beginner: "初級",
  intermediate: "中級",
  advanced: "上級",
};

export default function AdminCoursesPage() {
  const { user, isLoading, isAuthorized } = useRequireAdmin();
  const { authFetch } = useAuth();

  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    authFetch<{ courses: Course[] }>("/v1/courses")
      .then((res) => setCourses(res.courses))
      .catch((err) => setError(err instanceof ApiError ? err.message : "コース一覧の取得に失敗しました"));
  }

  useEffect(() => {
    if (!isAuthorized) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthorized]);

  async function togglePublish(course: Course) {
    setBusyId(course.id);
    try {
      await authFetch(`/v1/courses/${course.id}`, { method: "PUT", body: { isPublished: !course.isPublished } });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "更新に失敗しました");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(course: Course) {
    if (!window.confirm(`「${course.title}」を削除しますか？`)) return;
    setBusyId(course.id);
    try {
      await authFetch(`/v1/courses/${course.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "削除に失敗しました（受講履歴が存在する場合は削除できません）");
    } finally {
      setBusyId(null);
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
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">コース管理</h2>
          <a
            href="/admin/courses/new"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            新規コース作成
          </a>
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {courses === null && !error && <p className="text-sm text-gray-500">読み込み中...</p>}
        {courses !== null && courses.length === 0 && <p className="text-sm text-gray-500">コースがまだありません。</p>}

        {courses !== null && courses.length > 0 && (
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-400">
                  <th className="px-4 py-3 font-medium">タイトル</th>
                  <th className="px-4 py-3 font-medium">レベル</th>
                  <th className="px-4 py-3 font-medium">状態</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((course) => (
                  <tr key={course.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{course.title}</p>
                      {course.isMandatory && <span className="text-xs text-red-600">必須</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{LEVEL_LABEL[course.level]}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            course.isPublished ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {course.isPublished ? "公開中" : "非公開"}
                        </span>
                        {course.isLimited && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">限定</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3 text-xs">
                        <a href={`/admin/courses/${course.id}/edit`} className="text-blue-600 hover:underline">
                          編集
                        </a>
                        <a href={`/admin/courses/${course.id}/quiz`} className="text-blue-600 hover:underline">
                          テスト管理
                        </a>
                        <button
                          onClick={() => togglePublish(course)}
                          disabled={busyId === course.id}
                          className="text-gray-600 hover:underline disabled:opacity-50"
                        >
                          {course.isPublished ? "非公開にする" : "公開する"}
                        </button>
                        <button
                          onClick={() => handleDelete(course)}
                          disabled={busyId === course.id}
                          className="text-red-600 hover:underline disabled:opacity-50"
                        >
                          削除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
