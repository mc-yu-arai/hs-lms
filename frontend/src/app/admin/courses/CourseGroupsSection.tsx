"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import type { CourseGroupAssignment, Group } from "@/lib/types";

export function CourseGroupsSection({ courseId }: { courseId: string }) {
  const { authFetch } = useAuth();

  const [assignments, setAssignments] = useState<CourseGroupAssignment[] | null>(null);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  function loadAssignments() {
    authFetch<{ groups: CourseGroupAssignment[] }>(`/v1/courses/${courseId}/groups`)
      .then((res) => setAssignments(res.groups))
      .catch((err) => setError(err instanceof ApiError ? err.message : "グループ割り当ての取得に失敗しました"));
  }

  useEffect(() => {
    loadAssignments();
    authFetch<{ groups: Group[] }>("/v1/groups")
      .then((res) => setAllGroups(res.groups))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  async function handleAssign(groupId: string) {
    if (!groupId) return;
    setIsBusy(true);
    setError(null);
    try {
      await authFetch(`/v1/groups/${groupId}/courses`, { method: "POST", body: { courseId } });
      loadAssignments();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "グループの割り当てに失敗しました");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRemove(groupId: string) {
    if (!window.confirm("このグループの割り当てを解除しますか？（既存の受講登録・進捗はそのまま残ります）")) return;
    setIsBusy(true);
    setError(null);
    try {
      await authFetch(`/v1/groups/${groupId}/courses`, { method: "DELETE", body: { courseId } });
      loadAssignments();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "割り当て解除に失敗しました");
    } finally {
      setIsBusy(false);
    }
  }

  const assignedGroupIds = new Set((assignments ?? []).map((a) => a.group.id));
  const availableGroups = allGroups.filter((g) => !assignedGroupIds.has(g.id));

  return (
    <section className="rounded-xl bg-white p-6 shadow-sm">
      <h3 className="mb-1 text-base font-semibold text-gray-900">グループ割り当て</h3>
      <p className="mb-4 text-xs text-gray-500">
        限定公開コースは、ここで割り当てたグループのメンバーのみ閲覧・受講登録できます。全体公開のコースでも、割り当てるとグループの現メンバー全員に受講登録が自動作成されます。
      </p>

      {error && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <select
        value=""
        onChange={(e) => handleAssign(e.target.value)}
        disabled={isBusy || availableGroups.length === 0}
        className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
      >
        <option value="">
          {availableGroups.length === 0 ? "割り当て可能なグループがありません" : "グループを選択すると追加されます..."}
        </option>
        {availableGroups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>

      {assignments === null ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : assignments.length === 0 ? (
        <p className="text-sm text-gray-500">割り当てられたグループはありません。</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {assignments.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-gray-900">{a.group.name}</span>
              <button
                type="button"
                onClick={() => handleRemove(a.group.id)}
                disabled={isBusy}
                className="text-xs text-red-600 hover:underline disabled:opacity-50"
              >
                解除
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
