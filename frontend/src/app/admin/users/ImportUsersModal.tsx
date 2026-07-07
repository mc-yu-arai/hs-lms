"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import type { CsvRowError } from "@/lib/types";

interface ImportUsersModalProps {
  onClose: () => void;
  onImported: () => void;
}

export function ImportUsersModal({ onClose, onImported }: ImportUsersModalProps) {
  const { authFetch, authFetchBlob } = useAuth();

  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<CsvRowError[] | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownloadTemplate() {
    setDownloadError(null);
    try {
      const blob = await authFetchBlob("/v1/users/import/template");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "users_import_template.csv";
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
      const res = await authFetch<{ count: number }>("/v1/users/import", { method: "POST", body: formData });
      setSuccessCount(res.count);
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
        <h3 className="mb-4 text-base font-semibold text-gray-900">CSVでユーザーを一括インポート</h3>

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
          <p className="text-xs text-gray-500">
            列構成: 姓,名,メールアドレス,ロール(learner/admin/super_admin),部署,入社日(YYYY-MM-DD),グループ（複数指定時は;区切り）。1件でもエラーがあると全件インポートされません。
          </p>

          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          {rowErrors && rowErrors.length > 0 && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              <p className="mb-2 font-medium">CSVの内容にエラーがあります（何も作成されていません）</p>
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
              {successCount}件のユーザーをインポートしました。
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
