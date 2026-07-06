"use client";

import { useRouter } from "next/navigation";
import { useRequireAdmin } from "@/lib/use-require-admin";
import { useAuth } from "@/lib/auth-context";
import { AdminHeader } from "../../AdminHeader";
import { CourseForm, type CourseFormValues } from "../CourseForm";

export default function NewCoursePage() {
  const { user, isLoading, isAuthorized } = useRequireAdmin();
  const { authFetch } = useAuth();
  const router = useRouter();

  async function handleSubmit(values: CourseFormValues) {
    const res = await authFetch<{ course: { id: string } }>("/v1/courses", { method: "POST", body: values });
    router.push(`/admin/courses/${res.course.id}/edit`);
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
        <h2 className="mb-6 text-lg font-bold text-gray-900">新規コース作成</h2>
        <CourseForm submitLabel="コースを作成する" onSubmit={handleSubmit} />
      </div>
    </main>
  );
}
