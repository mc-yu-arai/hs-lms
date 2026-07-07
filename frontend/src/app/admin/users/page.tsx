"use client";

import { useEffect, useState } from "react";
import { useRequireAdmin } from "@/lib/use-require-admin";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import type { AuthUser, Group, UserRole } from "@/lib/types";
import { AdminHeader } from "../AdminHeader";
import { NewUserModal } from "./NewUserModal";
import { ImportUsersModal } from "./ImportUsersModal";

const ROLE_LABEL: Record<UserRole, string> = {
  learner: "受講者",
  admin: "管理者",
  super_admin: "システム管理者",
};

export default function AdminUsersPage() {
  const { user, isLoading, isAuthorized } = useRequireAdmin();
  const { authFetch } = useAuth();

  const [users, setUsers] = useState<AuthUser[] | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [showNewUserModal, setShowNewUserModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  function load() {
    authFetch<{ users: AuthUser[] }>("/v1/users")
      .then((res) => setUsers(res.users))
      .catch((err) => setError(err instanceof ApiError ? err.message : "ユーザー一覧の取得に失敗しました"));
  }

  useEffect(() => {
    if (!isAuthorized) return;
    load();
    authFetch<{ groups: Group[] }>("/v1/groups")
      .then((res) => setGroups(res.groups))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthorized]);

  async function updateUser(targetId: string, patch: { role?: UserRole; isActive?: boolean }) {
    setBusyId(targetId);
    setRowErrors((prev) => ({ ...prev, [targetId]: "" }));
    try {
      await authFetch(`/v1/users/${targetId}`, { method: "PUT", body: patch });
      load();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "更新に失敗しました";
      setRowErrors((prev) => ({ ...prev, [targetId]: message }));
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
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">ユーザー管理</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowImportModal(true)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              CSVインポート
            </button>
            <button
              onClick={() => setShowNewUserModal(true)}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              新規作成
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {users === null && !error && <p className="text-sm text-gray-500">読み込み中...</p>}

        {users !== null && (
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-400">
                  <th className="px-4 py-3 font-medium">氏名</th>
                  <th className="px-4 py-3 font-medium">メールアドレス</th>
                  <th className="px-4 py-3 font-medium">部署</th>
                  <th className="px-4 py-3 font-medium">ロール</th>
                  <th className="px-4 py-3 font-medium">状態</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === user.id;
                  return (
                    <tr key={u.id} className="border-b border-gray-100 last:border-0 align-top">
                      <td className="px-4 py-3 text-gray-900">
                        {u.lastName} {u.firstName}
                        {isSelf && <span className="ml-1 text-xs text-gray-400">（自分）</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{u.email}</td>
                      <td className="px-4 py-3 text-gray-600">{u.department ?? "-"}</td>
                      <td className="px-4 py-3">
                        <select
                          value={u.role}
                          disabled={isSelf || busyId === u.id}
                          onChange={(e) => updateUser(u.id, { role: e.target.value as UserRole })}
                          className="rounded-md border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
                        >
                          {(Object.keys(ROLE_LABEL) as UserRole[]).map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABEL[role]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => updateUser(u.id, { isActive: !u.isActive })}
                          disabled={isSelf || busyId === u.id}
                          className={`rounded-full px-2 py-0.5 text-xs font-medium disabled:opacity-50 ${
                            u.isActive ? "bg-green-50 text-green-700 hover:bg-green-100" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          }`}
                        >
                          {u.isActive ? "有効" : "無効"}
                        </button>
                        {rowErrors[u.id] && <p className="mt-1 text-xs text-red-600">{rowErrors[u.id]}</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNewUserModal && (
        <NewUserModal
          groups={groups}
          onClose={() => setShowNewUserModal(false)}
          onCreated={load}
        />
      )}
      {showImportModal && (
        <ImportUsersModal
          onClose={() => setShowImportModal(false)}
          onImported={load}
        />
      )}
    </main>
  );
}
