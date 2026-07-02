"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import type { Course, EnrollmentStatus, EnrollmentSummary, UserRole } from "@/lib/types";

const LEVEL_LABEL: Record<Course["level"], string> = {
  beginner: "初級",
  intermediate: "中級",
  advanced: "上級",
};

const ROLE_LABEL: Record<UserRole, string> = {
  learner: "受講者",
  admin: "管理者",
  super_admin: "システム管理者",
};

const STATUS_LABEL: Record<EnrollmentStatus, string> = {
  enrolled: "登録済み",
  in_progress: "受講中",
  completed: "修了",
  expired: "期限切れ",
};

const STATUS_BADGE_CLASS: Record<EnrollmentStatus, string> = {
  enrolled: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-50 text-blue-700",
  completed: "bg-green-50 text-green-700",
  expired: "bg-red-50 text-red-700",
};

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading, authFetch, logout } = useAuth();
  const [enrollments, setEnrollments] = useState<EnrollmentSummary[] | null>(null);
  const [enrollmentsError, setEnrollmentsError] = useState<string | null>(null);
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [coursesError, setCoursesError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    authFetch<{ enrollments: EnrollmentSummary[] }>("/v1/users/me/enrollments")
      .then((res) => setEnrollments(res.enrollments))
      .catch((err) => setEnrollmentsError(err instanceof ApiError ? err.message : "受講中コースの取得に失敗しました"));
  }, [user, authFetch]);

  useEffect(() => {
    if (!user) return;
    authFetch<{ courses: Course[] }>("/v1/courses")
      .then((res) => setCourses(res.courses))
      .catch((err) => setCoursesError(err instanceof ApiError ? err.message : "コース一覧の取得に失敗しました"));
  }, [user, authFetch]);

  if (isLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">読み込み中...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <h1 className="text-lg font-bold text-gray-900">HS-LMS</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {user.lastName} {user.firstName} さん
            </span>
            <button onClick={() => logout()} className="text-sm text-gray-500 transition-colors hover:text-gray-700">
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8">
        <section className="mb-8 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">
            ようこそ、{user.lastName} {user.firstName} さん
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            所属: {user.department ?? "未設定"} ／ ロール: {ROLE_LABEL[user.role]}
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-4 text-base font-semibold text-gray-900">受講中コース一覧</h2>

          {enrollmentsError && (
            <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {enrollmentsError}
            </p>
          )}

          {!enrollmentsError && enrollments === null && <p className="text-sm text-gray-500">読み込み中...</p>}

          {enrollments !== null && enrollments.length === 0 && (
            <p className="text-sm text-gray-500">受講中のコースはまだありません。下のコースカタログから受講を開始しましょう。</p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {enrollments?.map((enrollment) => (
              <div key={enrollment.id} className="rounded-xl bg-white p-5 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[enrollment.status]}`}>
                    {STATUS_LABEL[enrollment.status]}
                  </span>
                  {enrollment.course.isMandatory && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">必須</span>
                  )}
                </div>
                <h3 className="text-sm font-semibold text-gray-900">{enrollment.course.title}</h3>

                <div className="mt-3">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-blue-600"
                      style={{ width: `${Math.min(100, Math.max(0, enrollment.progressRate))}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-400">進捗率: {enrollment.progressRate}%</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-base font-semibold text-gray-900">コースカタログ</h2>

          {coursesError && (
            <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {coursesError}
            </p>
          )}

          {!coursesError && courses === null && <p className="text-sm text-gray-500">読み込み中...</p>}

          {courses !== null && courses.length === 0 && (
            <p className="text-sm text-gray-500">公開中のコースはまだありません。</p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses?.map((course) => (
              <div key={course.id} className="rounded-xl bg-white p-5 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                    {LEVEL_LABEL[course.level]}
                  </span>
                  {course.isMandatory && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">必須</span>
                  )}
                </div>
                <h3 className="text-sm font-semibold text-gray-900">{course.title}</h3>
                {course.description && <p className="mt-1 line-clamp-2 text-xs text-gray-500">{course.description}</p>}
                {course.durationMinutes !== null && (
                  <p className="mt-3 text-xs text-gray-400">学習時間目安: {course.durationMinutes}分</p>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
