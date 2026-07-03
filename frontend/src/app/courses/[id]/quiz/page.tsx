"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import type { QuizAttemptResult, QuizDetail } from "@/lib/types";

export function quizResultStorageKey(courseId: string) {
  return `quizResult:${courseId}`;
}

export default function QuizTakingPage() {
  const params = useParams<{ id: string }>();
  const courseId = params.id;
  const router = useRouter();
  const { user, isLoading, authFetch } = useAuth();

  const [quizDetail, setQuizDetail] = useState<QuizDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, Set<string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    authFetch<QuizDetail>(`/v1/courses/${courseId}/quiz`)
      .then(setQuizDetail)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "テストの取得に失敗しました"));
  }, [user, authFetch, courseId]);

  const isAnswerComplete = useMemo(() => {
    if (!quizDetail) return false;
    return quizDetail.questions.every((q) => (answers[q.id]?.size ?? 0) > 0);
  }, [quizDetail, answers]);

  function selectSingle(questionId: string, choiceId: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: new Set([choiceId]) }));
  }

  function toggleMultiple(questionId: string, choiceId: string) {
    setAnswers((prev) => {
      const next = new Set(prev[questionId] ?? []);
      if (next.has(choiceId)) next.delete(choiceId);
      else next.add(choiceId);
      return { ...prev, [questionId]: next };
    });
  }

  async function handleSubmit() {
    if (!quizDetail) return;
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const payload = {
        answers: quizDetail.questions.map((q) => ({
          questionId: q.id,
          choiceIds: [...(answers[q.id] ?? [])],
        })),
      };
      const result = await authFetch<QuizAttemptResult>(`/v1/courses/${courseId}/quiz/attempts`, {
        method: "POST",
        body: payload,
      });
      sessionStorage.setItem(quizResultStorageKey(courseId), JSON.stringify({ result, quizDetail }));
      router.push(`/courses/${courseId}/quiz/result`);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "回答の送信に失敗しました");
    } finally {
      setIsSubmitting(false);
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
          <a href={`/courses/${courseId}`} className="text-sm text-blue-600 hover:underline">
            コース詳細に戻る
          </a>
        </div>
      </main>
    );
  }

  if (!quizDetail) {
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
        <h2 className="mb-1 text-lg font-bold text-gray-900">{quizDetail.quiz.title}</h2>
        {quizDetail.quiz.description && <p className="mb-2 text-sm text-gray-600">{quizDetail.quiz.description}</p>}
        <p className="mb-6 text-xs text-gray-400">合格ライン: {quizDetail.quiz.passScore}点以上（何度でも再受験できます）</p>

        <div className="space-y-6">
          {quizDetail.questions.map((question, index) => (
            <section key={question.id} className="rounded-xl bg-white p-6 shadow-sm">
              <h3 className="mb-1 text-sm font-semibold text-gray-900">
                問{index + 1}. {question.questionText}
              </h3>
              <p className="mb-3 text-xs text-gray-400">
                {question.questionType === "single_choice" ? "1つ選択してください" : "当てはまるものを全て選択してください"}
              </p>
              <div className="space-y-2">
                {question.choices.map((choice) => {
                  const checked = answers[question.id]?.has(choice.id) ?? false;
                  return (
                    <label
                      key={choice.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 transition-colors hover:bg-gray-50"
                    >
                      <input
                        type={question.questionType === "single_choice" ? "radio" : "checkbox"}
                        name={question.id}
                        checked={checked}
                        onChange={() =>
                          question.questionType === "single_choice"
                            ? selectSingle(question.id, choice.id)
                            : toggleMultiple(question.id, choice.id)
                        }
                        className="h-4 w-4"
                      />
                      {choice.choiceText}
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {submitError && (
          <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {submitError}
          </p>
        )}
        {!isAnswerComplete && (
          <p className="mt-4 text-xs text-amber-600">未回答の設問があります。全ての設問に回答してから提出してください。</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={isSubmitting || !isAnswerComplete}
          className="mt-6 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? "採点中..." : "回答を提出する"}
        </button>
      </div>
    </main>
  );
}
