"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import type { CertificateInfo, CourseDetail } from "@/lib/types";

export default function CertificatePage() {
  const params = useParams<{ id: string }>();
  const courseId = params.id;
  const router = useRouter();
  const { user, isLoading, authFetch, authFetchBlob } = useAuth();

  const [certificate, setCertificate] = useState<CertificateInfo | null>(null);
  const [courseTitle, setCourseTitle] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      authFetch<{ certificate: CertificateInfo }>(`/v1/courses/${courseId}/certificate`, { method: "POST" }),
      authFetch<CourseDetail>(`/v1/courses/${courseId}`),
    ])
      .then(([certRes, courseRes]) => {
        setCertificate(certRes.certificate);
        setCourseTitle(courseRes.course.title);
        const verifyUrl = `${window.location.origin}/certificates/${certRes.certificate.verificationUuid}`;
        return QRCode.toDataURL(verifyUrl, { margin: 1, width: 160 });
      })
      .then(setQrDataUrl)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "修了証の取得に失敗しました"));
  }, [user, authFetch, courseId]);

  async function handleDownload() {
    setDownloadError(null);
    setIsDownloading(true);
    try {
      const blob = await authFetchBlob(`/v1/courses/${courseId}/certificate/download`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "certificate.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err instanceof ApiError ? err.message : "ダウンロードに失敗しました");
    } finally {
      setIsDownloading(false);
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

  if (!certificate || courseTitle === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">読み込み中...</p>
      </main>
    );
  }

  const issuedDate = new Date(certificate.issuedAt).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });

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
        <div className="relative rounded-xl border-4 border-blue-700 bg-white p-6 text-center shadow-sm sm:p-10 md:p-12">
          <h2 className="mb-6 text-2xl font-bold text-gray-900 sm:mb-8 sm:text-3xl">修了証</h2>
          <p className="mb-4 text-lg font-semibold text-gray-900 sm:text-xl">
            {user.lastName} {user.firstName} 様
          </p>
          <p className="mb-2 text-sm text-gray-600">あなたは下記のコースを修了したことをここに証します。</p>
          <p className="mb-6 text-lg font-semibold text-gray-900 sm:text-xl">{courseTitle}</p>
          <p className="mb-6 text-sm text-gray-500">発行日: {issuedDate}</p>

          {qrDataUrl && (
            <div className="mt-2 flex flex-col items-center text-center sm:absolute sm:bottom-6 sm:right-6 sm:mt-0 sm:block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="検証用QRコード" className="h-16 w-16 sm:h-20 sm:w-20" />
              <p className="mt-1 text-[10px] text-gray-400">QRコードで真正性を確認</p>
            </div>
          )}
        </div>

        {downloadError && (
          <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {downloadError}
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-3 sm:gap-4">
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="rounded-md bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {isDownloading ? "生成中..." : "PDFをダウンロード"}
          </button>
          <a
            href={`/certificates/${certificate.verificationUuid}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            検証ページを見る
          </a>
        </div>
      </div>
    </main>
  );
}
