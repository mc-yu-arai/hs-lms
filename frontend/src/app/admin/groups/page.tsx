"use client";

import { useEffect, useState } from "react";
import { useRequireAdmin } from "@/lib/use-require-admin";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import type { Group } from "@/lib/types";
import { AdminHeader } from "../AdminHeader";

export default function AdminGroupsPage() {
  const { user, isLoading, isAuthorized } = useRequireAdmin();
  const { authFetch } = useAuth();

  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function load() {
    authFetch<{ groups: Group[] }>("/v1/groups")
      .then((res) => setGroups(res.groups))
      .catch((err) => setError(err instanceof ApiError ? err.message : "グループ一覧の取得に失敗しました"));
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
      await authFetch("/v1/groups", { method: "POST", body: { name: newName, description: newDescription || null } });
      setNewName("");
      setNewDescription("");
      load();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "グループの作成に失敗しました");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDelete(group: Group) {
    if (!window.confirm(`「${group.name}」を削除しますか？（受講登録には影響しません）`)) return;
    setBusyId(group.id);
    try {
      await authFetch(`/v1/groups/${group.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "削除に失敗しました");
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
      <div className="mx-auto max-w-5xl px-4 py-8">
        <h2 className="mb-6 text-lg font-bold text-gray-900">グループ管理</h2>

        <section className="mb-6 rounded-xl bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-base font-semibold text-gray-900">新規グループ作成</h3>
          <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block flex-1 text-sm">
              <span className="mb-1 block text-gray-700">グループ名</span>
              <input
                type="text"
                required
                maxLength={100}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block flex-1 text-sm">
              <span className="mb-1 block text-gray-700">説明（任意）</span>
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
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

        {groups === null && !error && <p className="text-sm text-gray-500">読み込み中...</p>}
        {groups !== null && groups.length === 0 && <p className="text-sm text-gray-500">グループがまだありません。</p>}

        {groups !== null && groups.length > 0 && (
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-400">
                  <th className="px-4 py-3 font-medium">グループ名</th>
                  <th className="px-4 py-3 font-medium">説明</th>
                  <th className="px-4 py-3 font-medium">メンバー数</th>
                  <th className="px-4 py-3 font-medium">割当コース数</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-gray-900">{group.name}</td>
                    <td className="px-4 py-3 text-gray-600">{group.description ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-600">{group.memberCount}</td>
                    <td className="px-4 py-3 text-gray-600">{group.courseCount}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3 text-xs">
                        <a href={`/admin/groups/${group.id}`} className="text-blue-600 hover:underline">
                          詳細・編集
                        </a>
                        <button
                          onClick={() => handleDelete(group)}
                          disabled={busyId === group.id}
                          className="text-red-600 hover:underline disabled:opacity-50"
                        >
                          削除
                        </button>
                      </div>
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
