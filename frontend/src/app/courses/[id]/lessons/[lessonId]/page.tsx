"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import type { CourseDetail, CourseProgress, LessonSummary } from "@/lib/types";

const VIDEO_SAVE_INTERVAL_MS = 5000;
const SCROLL_COMPLETE_THRESHOLD_PX = 24;

// SCORM/LearnWizのzip展開済みコンテンツは同一オリジン配信プロキシ(app/api/lesson-content)経由で読み込む。
// SupabaseStorageの公開URLを直接iframeに読み込むと、SCORMランタイムのwindow.parent.API探索が
// クロスオリジンで失敗するため。
function lessonContentProxyUrl(contentUrl: string): string {
  return `/api/lesson-content/${contentUrl}`;
}

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
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-3 py-3 sm:px-4 sm:py-4">
          <h1 className="text-base font-bold text-gray-900 sm:text-lg">HS-LMS</h1>
          <a href={`/courses/${courseId}`} className="text-xs text-gray-500 transition-colors hover:text-gray-700 sm:text-sm">
            コース詳細に戻る
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-2 py-4 sm:px-4 sm:py-8">
        <p className="mb-1 px-1 text-xs text-gray-400">{detail.course.title}</p>
        <h2 className="mb-4 px-1 text-base font-bold text-gray-900 sm:text-lg">
          {lesson.title}
          {lessonProgress?.isCompleted && <span className="ml-2 text-sm font-normal text-green-700">✓ 完了済み</span>}
        </h2>

        <section className="mb-6 rounded-xl bg-white p-2 shadow-sm sm:p-6">
          {lesson.contentType === "video" && (
            <VideoLesson lesson={lesson} initialPositionSeconds={lessonProgress?.lastPositionSeconds ?? null} onProgress={handleVideoProgress} onEnded={handleVideoEnded} />
          )}
          {lesson.contentType === "pdf" && <PdfLesson lesson={lesson} />}
          {lesson.contentType === "text" && <TextLesson lesson={lesson} onReachBottom={handleMarkComplete} alreadyCompleted={lessonProgress?.isCompleted ?? false} />}
          {lesson.contentType === "learnwiz" && <LearnWizLesson lesson={lesson} />}
          {lesson.contentType === "scorm" && (
            <ScormLesson lesson={lesson} alreadyCompleted={lessonProgress?.isCompleted ?? false} onComplete={handleVideoEnded} />
          )}

          {(lesson.contentType === "pdf" || lesson.contentType === "text" || lesson.contentType === "learnwiz") && (
            <div className="mt-4 px-1">
              {actionError && (
                <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  {actionError}
                </p>
              )}
              <button
                onClick={handleMarkComplete}
                disabled={isSubmitting || lessonProgress?.isCompleted}
                className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50 sm:w-auto"
              >
                {lessonProgress?.isCompleted ? "完了済み" : isSubmitting ? "更新中..." : "このレッスンを完了する"}
              </button>
            </div>
          )}
        </section>

        <div className="flex items-center justify-between gap-3 px-1">
          {prevLesson ? (
            <a
              href={`/courses/${courseId}/lessons/${prevLesson.id}`}
              className="rounded-md border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:px-4"
            >
              ← 前のレッスン
            </a>
          ) : (
            <span />
          )}
          {nextLesson && (
            <a
              href={`/courses/${courseId}/lessons/${nextLesson.id}`}
              className="rounded-md border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:px-4"
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
      className="w-full max-w-full rounded-lg bg-black"
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
  return <iframe src={lesson.contentUrl} title={lesson.title} className="h-[75vh] w-full max-w-full rounded-lg border border-gray-200" />;
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
      className="max-h-[65vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-4 text-sm leading-relaxed text-gray-800 sm:p-6"
    >
      {lesson.contentBody || "本文が設定されていません。"}
    </div>
  );
}

function LearnWizLesson({ lesson }: { lesson: LessonSummary }) {
  if (!lesson.contentUrl) {
    return <p className="text-sm text-gray-500">コンテンツが設定されていません。</p>;
  }
  return <FullscreenIframe src={lessonContentProxyUrl(lesson.contentUrl)} title={lesson.title} />;
}

// ブラウザ標準のFullscreen APIとCSSによる疑似フルスクリーンを両方サポートする、
// LearnWiz/SCORM共通の全画面表示コンポーネント。
// iPhoneのSafariは<video>以外の要素に対するFullscreen API(requestFullscreen)を
// 現時点でもサポートしておらず(webkitプレフィックス版も同様)、呼び出しても無視されるか
// 例外になる既知の制約がある。そのためAPIが無い/失敗した場合は、コンテナをposition:fixedで
// ビューポート全体に広げる疑似フルスクリーンに自動フォールバックし、PC/タブレット/スマホの
// いずれでも「全画面ボタンを押すと画面いっぱいに表示される」という見た目の挙動を揃えている。
function FullscreenIframe({ src, title }: { src: string; title: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFallback, setIsFallback] = useState(false);

  // iframe内のLearnWiz/SCORMコンテンツ側に自身のレイアウト再計算(スケーリング処理)を促す。
  // 当初は「isFullscreen/isFallbackが変化した瞬間に1回だけ」発火させていたが、以下2パターンで
  // 症状が再現することが分かった:
  //   (A) 縦持ち→全画面→横持ち: 全画面中の実回転はOK(ブラウザの本物のresizeが飛ぶため)
  //   (B) 縦持ち→横持ち→全画面: 崩れる(横向きのまま全画面化した場合、LearnWiz側は
  //       「拡大(横向け)モード」自体には切り替わるが、スケール計算がその時点でまだ確定して
  //       いないコンテナサイズを拾ってしまい、小さいまま拡大モードになる)
  // (B)はコンテナのCSSクラスが切り替わった直後の一瞬(iOSのアドレスバー収縮アニメーション等と
  // 重なるタイミング)にだけ発生し、固定の遅延1回では取りこぼすことがあるため、発火経路を
  // 複数用意して冗長化している:
  //   1. isFullscreen/isFallbackの切り替え時に即座に発火(反応の速さを優先)
  //   2. コンテナの実ボックスサイズ変化を`ResizeObserver`で直接検知して発火
  //      (全画面のON/OFFに限らず、回転やアドレスバーの出し入れ等どんな原因でも拾える)
  //   3. 上記いずれかがトリガーされた後、レイアウトが遅れて確定するケースに備え、
  //      一定時間を空けて複数回(0.1秒後・0.4秒後・1秒後)再発火する
  // いずれの発火も同じdebounce付きの関数に集約しているため、短時間に何度呼ばれても
  // 実際の処理(resizeイベント発火+iframe幅のnudge)は連続で重複実行されない。
  useEffect(() => {
    const container = containerRef.current;
    const iframe = iframeRef.current;
    if (!container || !iframe) return;

    function fireResize() {
      try {
        iframe?.contentWindow?.dispatchEvent(new Event("resize"));
      } catch {
        // contentWindowに触れない(将来クロスオリジン化される等)場合は諦める
      }
    }

    function nudgeOnce() {
      fireResize();
      if (!iframe) return; // TSの型上、閉じ込めた変数はクロージャ境界を越えてnarrowingされないため再チェック
      const originalWidth = iframe.style.width;
      iframe.style.width = "calc(100% - 1px)";
      window.setTimeout(() => {
        if (!iframe) return;
        iframe.style.width = originalWidth;
        fireResize();
      }, 60);
    }

    const pendingTimers: number[] = [];
    let debounceTimer = 0;
    function scheduleNudge() {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        nudgeOnce();
        // iOS Safariのアドレスバー収縮アニメーション等でレイアウトが遅れて確定する場合に
        // 備え、少し間を空けて念のため再確認する。
        pendingTimers.push(window.setTimeout(nudgeOnce, 400));
        pendingTimers.push(window.setTimeout(nudgeOnce, 1000));
      }, 60);
    }

    // トリガー1: 全画面のON/OFF切り替え(このeffectのdeps)による即時発火
    scheduleNudge();

    // トリガー2: コンテナの実ボックスサイズ変化(原因を問わない)
    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(scheduleNudge);
      resizeObserver.observe(container);
    }

    // トリガー3: 端末の回転・ブラウザUIの変化そのもの
    window.addEventListener("resize", scheduleNudge);
    window.addEventListener("orientationchange", scheduleNudge);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleNudge);
      window.removeEventListener("orientationchange", scheduleNudge);
      window.clearTimeout(debounceTimer);
      pendingTimers.forEach((id) => window.clearTimeout(id));
    };
  }, [isFullscreen, isFallback]);

  // ネイティブFullscreen APIが使われている場合、ブラウザ側のESCキー処理や
  // ブラウザUIの「全画面終了」ボタンで抜けられた時にもstateを追随させる。
  useEffect(() => {
    function handleFullscreenChange() {
      if (isFallback) return; // 疑似フルスクリーン中はこのイベントの対象外
      const fsElement =
        document.fullscreenElement ??
        (document as unknown as { webkitFullscreenElement?: Element | null }).webkitFullscreenElement;
      setIsFullscreen(fsElement === containerRef.current);
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
    };
  }, [isFallback]);

  // 疑似フルスクリーン中は背後のページがスクロールしないようにし、ESCキーでも解除できるようにする
  // (ネイティブFullscreen APIの場合はブラウザが標準でESC解除・背後スクロール禁止を行うため不要)。
  useEffect(() => {
    if (!isFallback || !isFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsFullscreen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFallback, isFullscreen]);

  async function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;

    if (isFullscreen) {
      if (isFallback) {
        setIsFullscreen(false);
      } else {
        const exitFs =
          document.exitFullscreen?.bind(document) ??
          (document as unknown as { webkitExitFullscreen?: () => void }).webkitExitFullscreen?.bind(document);
        exitFs?.();
      }
      return;
    }

    const requestFs =
      el.requestFullscreen?.bind(el) ??
      (el as unknown as { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen?.bind(el);
    if (requestFs) {
      try {
        await requestFs();
        setIsFallback(false);
        setIsFullscreen(true);
        return;
      } catch {
        // iPhone Safari等、呼び出し自体はできてもAPIが機能しないケースへのフォールバック
      }
    }
    setIsFallback(true);
    setIsFullscreen(true);
  }

  return (
    <div
      ref={containerRef}
      className={
        isFullscreen && isFallback
          ? "fixed inset-0 z-50 h-[100dvh] w-screen bg-black"
          : "relative h-[75vh] w-full max-w-full"
      }
    >
      <iframe
        ref={iframeRef}
        src={src}
        title={title}
        className="h-full w-full rounded-lg border border-gray-200 bg-white"
      />
      <button
        type="button"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? "全画面表示を終了" : "全画面表示"}
        className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-md bg-black/60 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-black/75"
      >
        {isFullscreen ? <ExitFullscreenIcon /> : <EnterFullscreenIcon />}
        <span className="hidden sm:inline">{isFullscreen ? "全画面終了" : "全画面"}</span>
      </button>
    </div>
  );
}

function EnterFullscreenIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M7 3H3v4M13 3h4v4M7 17H3v-4M13 17h4v-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExitFullscreenIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M3 7h4V3M17 7h-4V3M3 13h4v4M17 13h-4v4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ScormLesson({
  lesson,
  alreadyCompleted,
  onComplete,
}: {
  lesson: LessonSummary;
  alreadyCompleted: boolean;
  onComplete: () => void | Promise<void>;
}) {
  const [isApiReady, setIsApiReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const hasFiredRef = useRef(alreadyCompleted);

  useEffect(() => {
    hasFiredRef.current = alreadyCompleted;
  }, [alreadyCompleted]);

  useEffect(() => {
    let cancelled = false;

    function fireCompleteOnce() {
      if (hasFiredRef.current) return;
      hasFiredRef.current = true;
      void onComplete();
    }

    async function setupApi() {
      try {
        if (lesson.scormVersion === "1.2") {
          const { Scorm12API } = await import("scorm-again");
          const api = new Scorm12API({ autocommit: true });
          // SCORM 1.2のAPIは LMSSetValue/LMSCommit という関数名のため、イベント名も
          // "SetValue"ではなく"LMSSetValue"接頭辞になる(2004の"SetValue"とは異なる)
          api.on("LMSSetValue.cmi.core.lesson_status", (_element: string, value: string) => {
            if (value === "completed" || value === "passed") fireCompleteOnce();
          });
          if (cancelled) return;
          (window as unknown as Record<string, unknown>).API = api;
        } else {
          const { Scorm2004API } = await import("scorm-again");
          const api = new Scorm2004API({ autocommit: true });
          api.on("SetValue.cmi.completion_status", (_element: string, value: string) => {
            if (value === "completed") fireCompleteOnce();
          });
          api.on("SetValue.cmi.success_status", (_element: string, value: string) => {
            if (value === "passed") fireCompleteOnce();
          });
          if (cancelled) return;
          (window as unknown as Record<string, unknown>).API_1484_11 = api;
        }
        if (!cancelled) setIsApiReady(true);
      } catch (err) {
        console.error("SCORM init error", err);
        if (!cancelled) setLoadError("SCORMランタイムの初期化に失敗しました");
      }
    }

    void setupApi();

    return () => {
      cancelled = true;
      // レッスン切り替え時に前のSCORMパッケージ用APIインスタンスが残らないようにする
      delete (window as unknown as Record<string, unknown>).API;
      delete (window as unknown as Record<string, unknown>).API_1484_11;
    };
  }, [lesson.scormVersion, onComplete]);

  if (!lesson.contentUrl) {
    return <p className="text-sm text-gray-500">コンテンツが設定されていません。</p>;
  }
  if (loadError) {
    return <p className="text-sm text-red-600">{loadError}</p>;
  }
  if (!isApiReady) {
    return <p className="text-sm text-gray-500">読み込み中...</p>;
  }

  return <FullscreenIframe src={lessonContentProxyUrl(lesson.contentUrl)} title={lesson.title} />;
}
