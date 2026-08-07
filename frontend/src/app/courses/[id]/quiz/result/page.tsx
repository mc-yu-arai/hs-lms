"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import type { QuizAttemptResult, QuizAttemptSummary, QuizDetail } from "@/lib/types";
import { quizResultStorageKey } from "../page";

interface StoredResult {
  result: QuizAttemptResult;
  quizDetail: QuizDetail;
}

export default function QuizResultPage() {
  const params = useParams<{ id: string }>();
  const courseId = params.id;
  const router = useRouter();
  const { user, isLoading, authFetch } = useAuth();

  const [stored] = useState<StoredResult | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem(quizResultStorageKey(courseId));
    return raw ? (JSON.parse(raw) as StoredResult) : null;
  });
  const [history, setHistory] = useState<QuizAttemptSummary[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    authFetch<{ attempts: QuizAttemptSummary[] }>(`/v1/courses/${courseId}/quiz/attempts`)
      .then((res) => setHistory(res.attempts))
      .catch((err) => setHistoryError(err instanceof ApiError ? err.message : "受験履歴の取得に失敗しました"));
  }, [user, authFetch, courseId]);

  if (isLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">読み込み中...</p>
      </main>
    );
  }

  const latestFromHistory = history?.[0] ?? null;
  const score = stored?.result.attempt.score ?? latestFromHistory?.score ?? null;
  const isPassed = stored?.result.attempt.isPassed ?? latestFromHistory?.isPassed ?? null;
  const courseCompleted = stored?.result.enrollment.status === "completed";

  const questionTextById = new Map((stored?.quizDetail.questions ?? []).map((q) => [q.id, q]));

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:py-4">
          <h1 className="text-base font-bold text-gray-900 sm:text-lg">HS-LMS</h1>
          <a href={`/courses/${courseId}`} className="text-xs text-gray-500 transition-colors hover:text-gray-700 sm:text-sm">
            コース詳細に戻る
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
        <section className="mb-6 rounded-xl bg-white p-5 text-center shadow-sm sm:p-8">
          {score === null ? (
            <p className="text-sm text-gray-500">受験履歴がまだありません。</p>
          ) : (
            <>
              <div className="mb-2 text-4xl">{isPassed ? "🎉" : "📝"}</div>
              <h2 className="mb-1 text-xl font-bold text-gray-900">{isPassed ? "合格しました" : "不合格でした"}</h2>
              <p className="text-3xl font-bold text-gray-900">{score}点</p>
              {!stored && (
                <p className="mt-3 text-xs text-gray-400">
                  設問ごとの正誤は表示できません（テスト提出直後のみ表示されます）。
                </p>
              )}
              {courseCompleted && <p className="mt-3 text-sm text-green-700">全レッスンとテストが完了し、コースを修了しました。</p>}
            </>
          )}

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a
              href={`/courses/${courseId}/quiz`}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              もう一度受験する
            </a>
            {courseCompleted ? (
              <a
                href={`/courses/${courseId}/complete`}
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700"
              >
                修了画面を見る
              </a>
            ) : (
              <a
                href={`/courses/${courseId}`}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                コース詳細に戻る
              </a>
            )}
          </div>
        </section>

        {stored && (
          <section className="mb-6 rounded-xl bg-white p-4 shadow-sm sm:p-6">
            <h3 className="mb-4 text-base font-semibold text-gray-900">設問ごとの結果</h3>
            <div className="space-y-4">
              {stored.result.questionResults.map((qr, index) => {
                const question = questionTextById.get(qr.questionId);
                return (
                  <div key={qr.questionId} className="rounded-md border border-gray-200 p-4">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900">
                        問{index + 1}. {question?.questionText ?? ""}
                      </p>
                      <span
                        className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                          qr.isCorrect ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                        }`}
                      >
                        {qr.isCorrect ? "正解" : "不正解"}
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {question?.choices.map((choice) => {
                        const wasSelected = qr.selectedChoiceIds.includes(choice.id);
                        const wasCorrectChoice = qr.correctChoiceIds.includes(choice.id);
                        return (
                          <li
                            key={choice.id}
                            className={`rounded px-2 py-1 text-xs ${
                              wasCorrectChoice ? "bg-green-50 text-green-800" : wasSelected ? "bg-red-50 text-red-800" : "text-gray-500"
                            }`}
                          >
                            {wasSelected ? "☑" : "☐"} {choice.choiceText}
                            {wasCorrectChoice ? "（正解）" : ""}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="rounded-xl bg-white p-4 shadow-sm sm:p-6">
          <h3 className="mb-4 text-base font-semibold text-gray-900">受験履歴</h3>
          {historyError && (
            <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {historyError}
            </p>
          )}
          {!historyError && history === null && <p className="text-sm text-gray-500">読み込み中...</p>}
          {history !== null && history.length === 0 && <p className="text-sm text-gray-500">まだ受験していません。</p>}
          {history !== null && history.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs text-gray-400">
                    <th className="py-2 font-medium">受験日時</th>
                    <th className="py-2 font-medium">得点</th>
                    <th className="py-2 font-medium">結果</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((attempt) => (
                    <tr key={attempt.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 whitespace-nowrap text-gray-700">{new Date(attempt.submittedAt).toLocaleString("ja-JP")}</td>
                      <td className="py-2 text-gray-700">{attempt.score}点</td>
                      <td className="py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            attempt.isPassed ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                          }`}
                        >
                          {attempt.isPassed ? "合格" : "不合格"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
