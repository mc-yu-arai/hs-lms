"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import type { CsvRowError } from "@/lib/types";

interface QuizImportModalProps {
  courseId: string;
  onClose: () => void;
  onImported: () => void;
}

type ImportMode = "append" | "replace";

export function QuizImportModal({ courseId, onClose, onImported }: QuizImportModalProps) {
  const { authFetch, authFetchBlob } = useAuth();

  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<ImportMode>("append");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<CsvRowError[] | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownloadTemplate() {
    setDownloadError(null);
    try {
      const blob = await authFetchBlob(`/v1/courses/${courseId}/quiz/import/template`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "quiz_import_template.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err instanceof ApiError ? err.message : "テンプレートのダウンロードに失敗しました");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setError(null);
    setRowErrors(null);
    setSuccessCount(null);
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await authFetch<{ importedCount: number }>(`/v1/courses/${courseId}/quiz/import?mode=${mode}`, {
        method: "POST",
        body: formData,
      });
      setSuccessCount(res.importedCount);
      onImported();
    } catch (err) {
      if (err instanceof ApiError) {
        const details = err.details as { rowErrors?: CsvRowError[] } | undefined;
        if (details?.rowErrors) {
          setRowErrors(details.rowErrors);
        } else {
          setError(err.message);
        }
      } else {
        setError("CSVインポートに失敗しました");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-lg">
        <h3 className="mb-4 text-base font-semibold text-gray-900">CSVで問題を一括インポート</h3>

        <button onClick={handleDownloadTemplate} className="mb-4 text-sm text-blue-600 hover:underline">
          CSVテンプレートをダウンロード
        </button>
        {downloadError && <p className="mb-4 text-sm text-red-700">{downloadError}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-gray-700">CSVファイル</span>
            <input
              type="file"
              accept=".csv"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <fieldset className="text-sm">
            <legend className="mb-1 text-gray-700">取り込み方法</legend>
            <div className="space-y-1">
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="import-mode"
                  checked={mode === "append"}
                  onChange={() => setMode("append")}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  <span className="font-medium text-gray-900">既存の設問に追加する</span>
                  <span className="block text-xs text-gray-500">既存の設問はそのまま残し、CSVの内容を末尾に追加します。</span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="import-mode"
                  checked={mode === "replace"}
                  onChange={() => setMode("replace")}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  <span className="font-medium text-gray-900">既存の設問を置き換える</span>
                  <span className="block text-xs text-gray-500">既存の設問・選択肢をすべて削除し、CSVの内容だけにします。</span>
                </span>
              </label>
            </div>
          </fieldset>

          <p className="text-xs text-gray-500">
            列構成: 問題文,問題種別(single/multiple),選択肢1〜4(2〜4択、空欄は末尾から詰めて省略可),正解(単一選択は1〜4の数字、複数選択は&quot;1,3&quot;のようにカンマ区切り)。1件でもエラーがあると全件インポートされません。テスト未作成のコースの場合は仮タイトルでテストを自動作成します。
          </p>

          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          {rowErrors && rowErrors.length > 0 && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              <p className="mb-2 font-medium">CSVの内容にエラーがあります（何も変更されていません）</p>
              <ul className="list-inside list-disc space-y-1">
                {rowErrors.map((e, i) => (
                  <li key={i}>
                    {e.row}行目: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {successCount !== null && (
            <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              {successCount}件の設問をインポートしました。
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              閉じる
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !file}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? "インポート中..." : "インポート実行"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
