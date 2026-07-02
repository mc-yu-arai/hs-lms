"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import type { CourseDetail, CourseProgress, LessonSummary } from "@/lib/types";

const VIDEO_SAVE_INTERVAL_MS = 5000;
const SCROLL_COMPLETE_THRESHOLD_PX = 24;

interface ProgressUpdateResult {
  enrollment: { status: string };
}

export default function LessonViewerPage() {
  const params = useParams<{ id: string; lessonId: string }>();
  const courseId = params.id;
  const lessonId = params.lessonId;
  const router = useRouter();
  const { user, isLoading, authFetch } = useAuth();

  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    authFetch<CourseDetail>(`/v1/courses/${courseId}`)
      .then((res) => {
        if (!res.enrolled) {
          router.replace(`/courses/${courseId}`);
          return;
        }
        setDetail(res);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "コース情報の取得に失敗しました"));
  }, [user, authFetch, courseId, router]);

  useEffect(() => {
    if (!user) return;
    authFetch<CourseProgress>(`/v1/courses/${courseId}/progress`)
      .then(setProgress)
      .catch(() => undefined);
  }, [user, authFetch, courseId]);

  const allLessons = useMemo(() => detail?.chapters.flatMap((chapter) => chapter.lessons) ?? [], [detail]);
  const currentIndex = allLessons.findIndex((l) => l.id === lessonId);
  const lesson: LessonSummary | null = currentIndex >= 0 ? allLessons[currentIndex] : null;
  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex >= 0 && currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;
  const lessonProgress = progress?.lessons.find((l) => l.lessonId === lessonId) ?? null;

  const saveProgress = useCallback(
    async (input: { progressPercent?: number; lastPositionSeconds?: number; completed?: boolean; studyTimeDeltaSeconds?: number }) => {
      try {
        const res = await authFetch<ProgressUpdateResult>(`/v1/courses/${courseId}/lessons/${lessonId}/progress`, {
          method: "PUT",
          body: input,
        });
        return res;
      } catch {
        return null;
      }
    },
    [authFetch, courseId, lessonId],
  );

  async function handleMarkComplete() {
    setActionError(null);
    setIsSubmitting(true);
    try {
      const res = await authFetch<ProgressUpdateResult>(`/v1/courses/${courseId}/lessons/${lessonId}/progress`, {
        method: "PUT",
        body: { completed: true },
      });
      if (res.enrollment.status === "completed") {
        router.push(`/courses/${courseId}/complete`);
        return;
      }
      const refreshed = await authFetch<CourseProgress>(`/v1/courses/${courseId}/progress`);
      setProgress(refreshed);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "進捗の更新に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVideoProgress(percent: number, positionSeconds: number) {
    const res = await saveProgress({ progressPercent: percent, lastPositionSeconds: positionSeconds });
    if (res?.enrollment.status === "completed") {
      router.push(`/courses/${courseId}/complete`);
    }
  }

  async function handleVideoEnded() {
    const res = await saveProgress({ progressPercent: 100, completed: true });
    if (res?.enrollment.status === "completed") {
      router.push(`/courses/${courseId}/complete`);
      return;
    }
    const refreshed = await authFetch<CourseProgress>(`/v1/courses/${courseId}/progress`).catch(() => null);
    if (refreshed) setProgress(refreshed);
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
          <a href={`/courses/${courseId}`} className="text-sm text-blue-600 hover:underline">
            コース詳細に戻る
          </a>
        </div>
      </main>
    );
  }

  if (!detail || !lesson) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">読み込み中...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <h1 className="text-lg font-bold text-gray-900">HS-LMS</h1>
          <a href={`/courses/${courseId}`} className="text-sm text-gray-500 transition-colors hover:text-gray-700">
            コース詳細に戻る
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <p className="mb-1 text-xs text-gray-400">{detail.course.title}</p>
        <h2 className="mb-4 text-lg font-bold text-gray-900">
          {lesson.title}
          {lessonProgress?.isCompleted && <span className="ml-2 text-sm font-normal text-green-700">✓ 完了済み</span>}
        </h2>

        <section className="mb-6 rounded-xl bg-white p-6 shadow-sm">
          {lesson.contentType === "video" && (
            <VideoLesson lesson={lesson} initialPositionSeconds={lessonProgress?.lastPositionSeconds ?? null} onProgress={handleVideoProgress} onEnded={handleVideoEnded} />
          )}
          {lesson.contentType === "pdf" && <PdfLesson lesson={lesson} />}
          {lesson.contentType === "text" && <TextLesson lesson={lesson} onReachBottom={handleMarkComplete} alreadyCompleted={lessonProgress?.isCompleted ?? false} />}
          {lesson.contentType === "scorm" && (
            <p className="text-sm text-gray-500">このコンテンツ形式（SCORM）は現在サポートされていません。</p>
          )}

          {(lesson.contentType === "pdf" || lesson.contentType === "text") && (
            <div className="mt-4">
              {actionError && (
                <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  {actionError}
                </p>
              )}
              <button
                onClick={handleMarkComplete}
                disabled={isSubmitting || lessonProgress?.isCompleted}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {lessonProgress?.isCompleted ? "完了済み" : isSubmitting ? "更新中..." : "このレッスンを完了する"}
              </button>
            </div>
          )}
        </section>

        <div className="flex items-center justify-between">
          {prevLesson ? (
            <a
              href={`/courses/${courseId}/lessons/${prevLesson.id}`}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              ← 前のレッスン
            </a>
          ) : (
            <span />
          )}
          {nextLesson && (
            <a
              href={`/courses/${courseId}/lessons/${nextLesson.id}`}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              次のレッスン →
            </a>
          )}
        </div>
      </div>
    </main>
  );
}

function VideoLesson({
  lesson,
  initialPositionSeconds,
  onProgress,
  onEnded,
}: {
  lesson: LessonSummary;
  initialPositionSeconds: number | null;
  onProgress: (percent: number, positionSeconds: number) => void;
  onEnded: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSaveRef = useRef(0);
  const hasSetInitialPositionRef = useRef(false);

  function handleLoadedMetadata() {
    if (hasSetInitialPositionRef.current) return;
    hasSetInitialPositionRef.current = true;
    const video = videoRef.current;
    if (video && initialPositionSeconds && initialPositionSeconds < video.duration) {
      video.currentTime = initialPositionSeconds;
    }
  }

  function saveIfDue(force: boolean) {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    const now = Date.now();
    if (!force && now - lastSaveRef.current < VIDEO_SAVE_INTERVAL_MS) return;
    lastSaveRef.current = now;
    const percent = Math.min(100, Math.round((video.currentTime / video.duration) * 100));
    onProgress(percent, Math.floor(video.currentTime));
  }

  if (!lesson.contentUrl) {
    return <p className="text-sm text-gray-500">動画URLが設定されていません。</p>;
  }

  return (
    <video
      ref={videoRef}
      src={lesson.contentUrl}
      controls
      className="w-full rounded-lg bg-black"
      onLoadedMetadata={handleLoadedMetadata}
      onTimeUpdate={() => saveIfDue(false)}
      onPause={() => saveIfDue(true)}
      onEnded={onEnded}
    >
      お使いのブラウザは動画再生に対応していません。
    </video>
  );
}

function PdfLesson({ lesson }: { lesson: LessonSummary }) {
  if (!lesson.contentUrl) {
    return <p className="text-sm text-gray-500">PDFのURLが設定されていません。</p>;
  }
  return <iframe src={lesson.contentUrl} title={lesson.title} className="h-[70vh] w-full rounded-lg border border-gray-200" />;
}

function TextLesson({
  lesson,
  onReachBottom,
  alreadyCompleted,
}: {
  lesson: LessonSummary;
  onReachBottom: () => void;
  alreadyCompleted: boolean;
}) {
  const hasFiredRef = useRef(alreadyCompleted);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    if (hasFiredRef.current) return;
    const el = event.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_COMPLETE_THRESHOLD_PX) {
      hasFiredRef.current = true;
      onReachBottom();
    }
  }

  return (
    <div
      onScroll={handleScroll}
      className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-6 text-sm leading-relaxed text-gray-800"
    >
      {lesson.contentBody || "本文が設定されていません。"}
    </div>
  );
}
