"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRequireAdmin } from "@/lib/use-require-admin";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import type { QuestionType, QuizDetail } from "@/lib/types";
import { AdminHeader } from "../../../AdminHeader";
import { QuizImportModal } from "./QuizImportModal";

interface ChoiceDraft {
  key: string;
  choiceText: string;
  isCorrect: boolean;
}

interface QuestionDraft {
  key: string;
  questionText: string;
  questionType: QuestionType;
  choices: ChoiceDraft[];
}

function newKey() {
  return Math.random().toString(36).slice(2, 10);
}

function newChoice(isCorrect = false): ChoiceDraft {
  return { key: newKey(), choiceText: "", isCorrect };
}

function newQuestion(): QuestionDraft {
  return { key: newKey(), questionText: "", questionType: "single_choice", choices: [newChoice(true), newChoice(false)] };
}

export default function AdminQuizPage() {
  const params = useParams<{ id: string }>();
  const courseId = params.id;
  const { user, isLoading, isAuthorized } = useRequireAdmin();
  const { authFetch } = useAuth();

  const [title, setTitle] = useState("修了確認テスト");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<QuestionDraft[]>([newQuestion()]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const loadQuiz = useCallback(() => {
    return authFetch<QuizDetail>(`/v1/courses/${courseId}/quiz`)
      .then((res) => {
        setTitle(res.quiz.title);
        setDescription(res.quiz.description ?? "");
        setQuestions(
          res.questions.map((q) => ({
            key: newKey(),
            questionText: q.questionText,
            questionType: q.questionType,
            choices: q.choices.map((c) => ({ key: newKey(), choiceText: c.choiceText, isCorrect: c.isCorrect ?? false })),
          })),
        );
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          // まだテストが無いコース。新規作成フォームとして空の状態から開始する
          return;
        }
        setLoadError(err instanceof ApiError ? err.message : "テストの取得に失敗しました");
      });
  }, [authFetch, courseId]);

  useEffect(() => {
    if (!isAuthorized) return;
    loadQuiz().finally(() => setIsLoaded(true));
  }, [isAuthorized, loadQuiz]);

  function updateQuestion(key: string, patch: Partial<QuestionDraft>) {
    setQuestions((prev) => prev.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  }

  function setQuestionType(key: string, questionType: QuestionType) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.key !== key) return q;
        if (questionType === "single_choice") {
          const firstCorrectIndex = q.choices.findIndex((c) => c.isCorrect);
          return {
            ...q,
            questionType,
            choices: q.choices.map((c, i) => ({ ...c, isCorrect: i === (firstCorrectIndex === -1 ? 0 : firstCorrectIndex) })),
          };
        }
        return { ...q, questionType };
      }),
    );
  }

  function toggleChoiceCorrect(questionKey: string, choiceKey: string) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.key !== questionKey) return q;
        if (q.questionType === "single_choice") {
          return { ...q, choices: q.choices.map((c) => ({ ...c, isCorrect: c.key === choiceKey })) };
        }
        return { ...q, choices: q.choices.map((c) => (c.key === choiceKey ? { ...c, isCorrect: !c.isCorrect } : c)) };
      }),
    );
  }

  function updateChoiceText(questionKey: string, choiceKey: string, choiceText: string) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.key !== questionKey ? q : { ...q, choices: q.choices.map((c) => (c.key === choiceKey ? { ...c, choiceText } : c)) },
      ),
    );
  }

  function addChoice(questionKey: string) {
    setQuestions((prev) => prev.map((q) => (q.key === questionKey ? { ...q, choices: [...q.choices, newChoice(false)] } : q)));
  }

  function removeChoice(questionKey: string, choiceKey: string) {
    setQuestions((prev) =>
      prev.map((q) => (q.key !== questionKey ? q : { ...q, choices: q.choices.filter((c) => c.key !== choiceKey) })),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);
    setIsSubmitting(true);
    try {
      await authFetch(`/v1/courses/${courseId}/quiz`, {
        method: "POST",
        body: {
          title,
          description: description || null,
          questions: questions.map((q) => ({
            questionText: q.questionText,
            questionType: q.questionType,
            choices: q.choices.map((c) => ({ choiceText: c.choiceText, isCorrect: c.isCorrect })),
          })),
        },
      });
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "保存に失敗しました");
    } finally {
      setIsSubmitting(false);
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
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">修了テスト編集</h2>
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            CSVでインポート
          </button>
        </div>
        <p className="mb-6 text-xs text-gray-400">保存すると既存の設問・選択肢は全て置き換わります（1コース1テスト）</p>

        {loadError && (
          <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {loadError}
          </p>
        )}

        {!isLoaded && <p className="text-sm text-gray-500">読み込み中...</p>}

        {isLoaded && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <section className="rounded-xl bg-white p-6 shadow-sm">
              <label className="mb-3 block text-sm">
                <span className="mb-1 block text-gray-700">テストタイトル</span>
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-gray-700">説明</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            </section>

            <div className="space-y-4">
              {questions.map((question, index) => (
                <section key={question.key} className="rounded-xl bg-white p-6 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">問{index + 1}</span>
                    <select
                      value={question.questionType}
                      onChange={(e) => setQuestionType(question.key, e.target.value as QuestionType)}
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                    >
                      <option value="single_choice">単一選択</option>
                      <option value="multiple_choice">複数選択</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setQuestions((prev) => prev.filter((q) => q.key !== question.key))}
                      disabled={questions.length <= 1}
                      className="ml-auto rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"
                    >
                      設問を削除
                    </button>
                  </div>

                  <textarea
                    required
                    placeholder="問題文"
                    value={question.questionText}
                    onChange={(e) => updateQuestion(question.key, { questionText: e.target.value })}
                    rows={2}
                    className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />

                  <div className="space-y-2">
                    {question.choices.map((choice) => (
                      <div key={choice.key} className="flex items-center gap-2">
                        <input
                          type={question.questionType === "single_choice" ? "radio" : "checkbox"}
                          name={`correct-${question.key}`}
                          checked={choice.isCorrect}
                          onChange={() => toggleChoiceCorrect(question.key, choice.key)}
                          className="h-4 w-4"
                          title="正解にする"
                        />
                        <input
                          required
                          placeholder="選択肢"
                          value={choice.choiceText}
                          onChange={(e) => updateChoiceText(question.key, choice.key, e.target.value)}
                          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => removeChoice(question.key, choice.key)}
                          disabled={question.choices.length <= 2}
                          className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"
                        >
                          削除
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => addChoice(question.key)}
                    className="mt-2 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    + 選択肢を追加
                  </button>
                </section>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setQuestions((prev) => [...prev, newQuestion()])}
              className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              + 設問を追加
            </button>

            {saveError && (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {saveError}
              </p>
            )}
            {saveSuccess && (
              <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                保存しました。
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? "保存中..." : "テストを保存する"}
            </button>
          </form>
        )}
      </div>

      {showImportModal && (
        <QuizImportModal
          courseId={courseId}
          onClose={() => setShowImportModal(false)}
          onImported={() => {
            loadQuiz();
          }}
        />
      )}
    </main>
  );
}
