"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import type { CourseDetail, CourseProgress, QuizDetail } from "@/lib/types";

const LEVEL_LABEL: Record<CourseDetail["course"]["level"], string> = {
  beginner: "初級",
  intermediate: "中級",
  advanced: "上級",
};

const CONTENT_TYPE_LABEL: Record<string, string> = {
  video: "動画",
  pdf: "PDF",
  text: "テキスト",
  scorm: "SCORM",
};

export default function CourseDetailPage() {
  const params = useParams<{ id: string }>();
  const courseId = params.id;
  const router = useRouter();
  const { user, isLoading, authFetch } = useAuth();

  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [hasQuiz, setHasQuiz] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    authFetch<CourseDetail>(`/v1/courses/${courseId}`)
      .then(setDetail)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "コース情報の取得に失敗しました"));
  }, [user, authFetch, courseId]);

  useEffect(() => {
    if (!user || !detail?.enrolled) return;
    authFetch<CourseProgress>(`/v1/courses/${courseId}/progress`)
      .then(setProgress)
      .catch(() => undefined);
  }, [user, authFetch, courseId, detail?.enrolled]);

  useEffect(() => {
    if (!user || !detail) return;
    if (!detail.enrolled && user.role === "learner") return;
    authFetch<QuizDetail>(`/v1/courses/${courseId}/quiz`)
      .then(() => setHasQuiz(true))
      .catch(() => setHasQuiz(false));
  }, [user, authFetch, courseId, detail]);

  async function handleEnroll() {
    setEnrollError(null);
    setIsEnrolling(true);
    try {
      await authFetch(`/v1/courses/${courseId}/enroll`, { method: "POST" });
      const refreshed = await authFetch<CourseDetail>(`/v1/courses/${courseId}`);
      setDetail(refreshed);
    } catch (err) {
      setEnrollError(err instanceof ApiError ? err.message : "受講登録に失敗しました");
    } finally {
      setIsEnrolling(false);
    }
  }

  if (isLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">読み込み中...</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-sm">
          <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {loadError}
          </p>
          <a href="/dashboard" className="text-sm text-blue-600 hover:underline">
            ダッシュボードに戻る
          </a>
        </div>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">読み込み中...</p>
      </main>
    );
  }

  const lessonProgressById = new Map((progress?.lessons ?? []).map((lessonProgress) => [lessonProgress.lessonId, lessonProgress]));

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:py-4">
          <h1 className="text-base font-bold text-gray-900 sm:text-lg">HS-LMS</h1>
          <a href="/dashboard" className="text-xs text-gray-500 transition-colors hover:text-gray-700 sm:text-sm">
            ダッシュボードに戻る
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
        <section className="mb-6 rounded-xl bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
              {LEVEL_LABEL[detail.course.level]}
            </span>
            {detail.course.isMandatory && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">必須</span>
            )}
          </div>
          <h2 className="text-xl font-bold text-gray-900">{detail.course.title}</h2>
          {detail.course.description && <p className="mt-2 text-sm text-gray-600">{detail.course.description}</p>}
          {detail.course.durationMinutes !== null && (
            <p className="mt-2 text-xs text-gray-400">学習時間目安: {detail.course.durationMinutes}分</p>
          )}

          {progress && (
            <div className="mt-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-blue-600"
                  style={{ width: `${Math.min(100, Math.max(0, progress.enrollment.progressRate))}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-400">進捗率: {progress.enrollment.progressRate}%</p>
            </div>
          )}

          {enrollError && (
            <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {enrollError}
            </p>
          )}

          {!detail.enrolled && (
            <button
              onClick={handleEnroll}
              disabled={isEnrolling}
              className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {isEnrolling ? "登録中..." : "受講を開始する"}
            </button>
          )}

          {progress?.enrollment.status === "completed" && (
            <a
              href={`/courses/${courseId}/complete`}
              className="mt-4 inline-block rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700"
            >
              修了画面を見る
            </a>
          )}

          {detail.enrolled && hasQuiz && (
            <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4">
              <p className="mb-2 text-sm text-gray-700">
                このコースには修了テストがあります。全レッスンを完了し、テストに合格するとコース修了となります。
              </p>
              <a
                href={`/courses/${courseId}/quiz`}
                className="inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                修了テストを受ける
              </a>
            </div>
          )}
        </section>

        <section className="rounded-xl bg-white p-4 shadow-sm sm:p-6">
          <h3 className="mb-4 text-base font-semibold text-gray-900">カリキュラム</h3>
          <div className="space-y-6">
            {detail.chapters.map((chapter) => (
              <div key={chapter.id}>
                <h4 className="mb-2 text-sm font-semibold text-gray-700">{chapter.title}</h4>
                <ul className="space-y-1">
                  {chapter.lessons.map((lesson) => {
                    const lessonProgress = lessonProgressById.get(lesson.id);
                    const isCompleted = lessonProgress?.isCompleted ?? false;
                    const content = (
                      <>
                        <span
                          className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs ${
                            isCompleted ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"
                          }`}
                        >
                          {isCompleted ? "✓" : ""}
                        </span>
                        <span className="flex-1 text-sm text-gray-800">{lesson.title}</span>
                        <span className="text-xs text-gray-400">{CONTENT_TYPE_LABEL[lesson.contentType] ?? lesson.contentType}</span>
                      </>
                    );

                    return (
                      <li key={lesson.id}>
                        {detail.enrolled ? (
                          <a
                            href={`/courses/${courseId}/lessons/${lesson.id}`}
                            className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-gray-50"
                          >
                            {content}
                          </a>
                        ) : (
                          <div className="flex items-center gap-3 rounded-md px-2 py-2 text-gray-400">{content}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
