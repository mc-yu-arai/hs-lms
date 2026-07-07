"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import type { CertificateVerifyResult } from "@/lib/types";

export default function CertificateVerifyPage() {
  const params = useParams<{ uuid: string }>();
  const uuid = params.uuid;

  const [result, setResult] = useState<CertificateVerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<CertificateVerifyResult>(`/v1/certificates/${uuid}/verify`)
      .then(setResult)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setResult({ valid: false });
          return;
        }
        setError(err instanceof ApiError ? err.message : "検証中にエラーが発生しました");
      });
  }, [uuid]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-sm">
        <h1 className="mb-6 text-lg font-bold text-gray-900">HS-LMS 修了証検証</h1>

        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {!error && result === null && <p className="text-sm text-gray-500">確認中...</p>}

        {!error && result !== null && result.valid && result.certificate && (
          <>
            <div className="mb-4 text-4xl">✅</div>
            <p className="mb-4 text-sm font-semibold text-green-700">これは有効な修了証です</p>
            <div className="space-y-2 rounded-md bg-gray-50 p-4 text-left text-sm">
              <p>
                <span className="text-gray-500">受講者: </span>
                <span className="font-medium text-gray-900">{result.certificate.learnerName} 様</span>
              </p>
              <p>
                <span className="text-gray-500">コース: </span>
                <span className="font-medium text-gray-900">{result.certificate.courseTitle}</span>
              </p>
              <p>
                <span className="text-gray-500">発行日: </span>
                <span className="font-medium text-gray-900">
                  {new Date(result.certificate.issuedAt).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })}
                </span>
              </p>
            </div>
          </>
        )}

        {!error && result !== null && !result.valid && (
          <>
            <div className="mb-4 text-4xl">⚠️</div>
            <p className="text-sm text-red-700">この修了証は確認できませんでした。</p>
          </>
        )}
      </div>
    </main>
  );
}
