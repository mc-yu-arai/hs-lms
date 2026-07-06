"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useRequireAdmin } from "@/lib/use-require-admin";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import type { CourseDetail } from "@/lib/types";
import { AdminHeader } from "../../../AdminHeader";
import { CourseForm, type CourseFormValues } from "../../CourseForm";

export default function EditCoursePage() {
  const params = useParams<{ id: string }>();
  const courseId = params.id;
  const { user, isLoading, isAuthorized } = useRequireAdmin();
  const { authFetch } = useAuth();
  const router = useRouter();

  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthorized) return;
    authFetch<CourseDetail>(`/v1/courses/${courseId}`)
      .then(setDetail)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "コース情報の取得に失敗しました"));
  }, [isAuthorized, authFetch, courseId]);

  async function handleSubmit(values: CourseFormValues) {
    await authFetch(`/v1/courses/${courseId}`, { method: "PUT", body: values });
    router.push("/admin/courses");
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
        <h2 className="mb-6 text-lg font-bold text-gray-900">コース編集</h2>
        {loadError && (
          <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {loadError}
          </p>
        )}
        {!loadError && !detail && <p className="text-sm text-gray-500">読み込み中...</p>}
        {detail && <CourseForm key={detail.course.id} initial={detail} excludeCourseId={courseId} submitLabel="変更を保存する" onSubmit={handleSubmit} />}
      </div>
    </main>
  );
}
