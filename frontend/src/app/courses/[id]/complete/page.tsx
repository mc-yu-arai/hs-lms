"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import type { CourseDetail, CourseProgress } from "@/lib/types";

export default function CourseCompletePage() {
  const params = useParams<{ id: string }>();
  const courseId = params.id;
  const router = useRouter();
  const { user, isLoading, authFetch } = useAuth();

  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    Promise.all([authFetch<CourseDetail>(`/v1/courses/${courseId}`), authFetch<CourseProgress>(`/v1/courses/${courseId}/progress`)])
      .then(([courseDetail, courseProgress]) => {
        setDetail(courseDetail);
        setProgress(courseProgress);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "情報の取得に失敗しました"));
  }, [user, authFetch, courseId]);

  if (isLoading || !user || (!detail && !error)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">読み込み中...</p>
      </main>
    );
  }

  if (error || !detail) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-sm">
          <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
          <a href="/dashboard" className="text-sm text-blue-600 hover:underline">
            ダッシュボードに戻る
          </a>
        </div>
      </main>
    );
  }

  const isActuallyCompleted = progress?.enrollment.status === "completed";

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-sm">
        {isActuallyCompleted ? (
          <>
            <div className="mb-4 text-5xl">🎉</div>
            <h1 className="mb-2 text-xl font-bold text-gray-900">コースを修了しました</h1>
            <p className="mb-1 text-sm text-gray-600">{detail.course.title}</p>
            {progress?.enrollment.completedAt && (
              <p className="mb-6 text-xs text-gray-400">修了日: {new Date(progress.enrollment.completedAt).toLocaleDateString("ja-JP")}</p>
            )}
          </>
        ) : (
          <>
            <h1 className="mb-2 text-xl font-bold text-gray-900">このコースはまだ修了していません</h1>
            <p className="mb-6 text-sm text-gray-600">残りのレッスンを完了すると、ここに修了メッセージが表示されます。</p>
          </>
        )}

        <div className="flex flex-wrap justify-center gap-4">
          {!isActuallyCompleted && (
            <a
              href={`/courses/${courseId}`}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              コースに戻る
            </a>
          )}
          {isActuallyCompleted && (
            <a
              href={`/courses/${courseId}/certificate`}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              修了証を見る
            </a>
          )}
          <a
            href="/dashboard"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            ダッシュボードに戻る
          </a>
        </div>
      </div>
    </main>
  );
}
