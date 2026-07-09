"use client";

import { useEffect, useState } from "react";
import { useRequireAdmin } from "@/lib/use-require-admin";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import type { Category } from "@/lib/types";
import { AdminHeader } from "../AdminHeader";

export default function AdminCategoriesPage() {
  const { user, isLoading, isAuthorized } = useRequireAdmin();
  const { authFetch } = useAuth();

  const [categories, setCategories] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  function load() {
    authFetch<{ categories: Category[] }>("/v1/categories")
      .then((res) => setCategories(res.categories))
      .catch((err) => setError(err instanceof ApiError ? err.message : "カテゴリ一覧の取得に失敗しました"));
  }

  useEffect(() => {
    if (!isAuthorized) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthorized]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setIsCreating(true);
    try {
      await authFetch("/v1/categories", { method: "POST", body: { name: newName } });
      setNewName("");
      load();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "カテゴリの作成に失敗しました");
    } finally {
      setIsCreating(false);
    }
  }

  function startEdit(category: Category) {
    setEditingId(category.id);
    setEditingName(category.name);
    setRowErrors((prev) => ({ ...prev, [category.id]: "" }));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
  }

  async function saveEdit(category: Category) {
    setBusyId(category.id);
    try {
      await authFetch(`/v1/categories/${category.id}`, { method: "PUT", body: { name: editingName } });
      setEditingId(null);
      load();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "更新に失敗しました";
      setRowErrors((prev) => ({ ...prev, [category.id]: message }));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(category: Category) {
    const courseCount = category.courseCount ?? 0;
    const confirmMessage =
      courseCount > 0
        ? `「${category.name}」には${courseCount}件のコースが紐付いているため削除できません。`
        : `「${category.name}」を削除しますか？`;

    if (courseCount > 0) {
      window.alert(confirmMessage);
      return;
    }
    if (!window.confirm(confirmMessage)) return;

    setBusyId(category.id);
    setRowErrors((prev) => ({ ...prev, [category.id]: "" }));
    try {
      await authFetch(`/v1/categories/${category.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "削除に失敗しました";
      setRowErrors((prev) => ({ ...prev, [category.id]: message }));
    } finally {
      setBusyId(null);
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
        <h2 className="mb-6 text-lg font-bold text-gray-900">カテゴリ管理</h2>

        <section className="mb-6 rounded-xl bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-base font-semibold text-gray-900">新規カテゴリ作成</h3>
          <form onSubmit={handleCreate} className="flex items-end gap-2">
            <label className="block flex-1 text-sm">
              <span className="mb-1 block text-gray-700">カテゴリ名</span>
              <input
                type="text"
                required
                maxLength={100}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={isCreating}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {isCreating ? "作成中..." : "作成する"}
            </button>
          </form>
          {createError && <p className="mt-3 text-sm text-red-700">{createError}</p>}
        </section>

        {error && (
          <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {categories === null && !error && <p className="text-sm text-gray-500">読み込み中...</p>}
        {categories !== null && categories.length === 0 && <p className="text-sm text-gray-500">カテゴリがまだありません。</p>}

        {categories !== null && categories.length > 0 && (
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-400">
                  <th className="px-4 py-3 font-medium">カテゴリ名</th>
                  <th className="px-4 py-3 font-medium">紐付きコース数</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id} className="border-b border-gray-100 last:border-0 align-top">
                    <td className="px-4 py-3 text-gray-900">
                      {editingId === category.id ? (
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                        />
                      ) : (
                        category.name
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{category.courseCount ?? 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3 text-xs">
                        {editingId === category.id ? (
                          <>
                            <button
                              onClick={() => saveEdit(category)}
                              disabled={busyId === category.id}
                              className="text-blue-600 hover:underline disabled:opacity-50"
                            >
                              保存
                            </button>
                            <button onClick={cancelEdit} className="text-gray-600 hover:underline">
                              キャンセル
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(category)} className="text-blue-600 hover:underline">
                              編集
                            </button>
                            <button
                              onClick={() => handleDelete(category)}
                              disabled={busyId === category.id}
                              className="text-red-600 hover:underline disabled:opacity-50"
                            >
                              削除
                            </button>
                          </>
                        )}
                      </div>
                      {rowErrors[category.id] && <p className="mt-1 text-xs text-red-600">{rowErrors[category.id]}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
