"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import type { AuthUser } from "@/lib/types";

export default function ProfilePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">読み込み中...</p>
      </main>
    );
  }

  // keyでuser.idごとに再マウントさせ、フォームの初期値をpropsから直接引くことで
  // 「userロード後にeffectでsetStateする」パターンを避ける
  return <ProfileForm key={user.id} user={user} />;
}

function ProfileForm({ user }: { user: AuthUser }) {
  const { authFetch, refreshUser } = useAuth();

  const [lastName, setLastName] = useState(user.lastName);
  const [firstName, setFirstName] = useState(user.firstName);
  const [department, setDepartment] = useState(user.department ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl ?? null);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaveError(null);
    setSaveMessage(null);
    setIsSaving(true);
    try {
      await authFetch("/v1/users/me", {
        method: "PUT",
        body: { lastName, firstName, department: department.trim() === "" ? null : department },
      });
      await refreshUser();
      setSaveMessage("プロフィールを更新しました");
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "プロフィールの更新に失敗しました");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setAvatarError(null);
    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const res = await authFetch<{ avatarUrl: string }>("/v1/users/me/avatar", {
        method: "POST",
        body: formData,
      });
      setAvatarUrl(res.avatarUrl);
      await refreshUser();
    } catch (err) {
      setAvatarError(err instanceof ApiError ? err.message : "アイコン画像のアップロードに失敗しました");
    } finally {
      setIsUploadingAvatar(false);
      event.target.value = "";
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <h1 className="text-lg font-bold text-gray-900">HS-LMS</h1>
          <a href="/dashboard" className="text-sm text-gray-500 transition-colors hover:text-gray-700">
            ダッシュボードに戻る
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-8">
        <section className="mb-8 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-900">アイコン画像</h2>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 overflow-hidden rounded-full bg-gray-100">
              {avatarUrl ? (
                // アイコンはSupabase Storageの外部URLのため next/image のドメイン設定を避けて img を使用
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">未設定</div>
              )}
            </div>
            <div>
              <label className="inline-block cursor-pointer rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
                {isUploadingAvatar ? "アップロード中..." : "画像を選択"}
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={handleAvatarChange}
                  disabled={isUploadingAvatar}
                />
              </label>
              <p className="mt-1 text-xs text-gray-400">JPEG/PNG、最大2MB</p>
            </div>
          </div>

          {avatarError && (
            <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {avatarError}
            </p>
          )}
        </section>

        <section className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-900">プロフィール情報</h2>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                  姓
                </label>
                <input
                  id="lastName"
                  required
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                  名
                </label>
                <input
                  id="firstName"
                  required
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="department" className="block text-sm font-medium text-gray-700">
                所属部門
              </label>
              <input
                id="department"
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {saveError && (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {saveError}
              </p>
            )}
            {saveMessage && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{saveMessage}</p>}

            <button
              type="submit"
              disabled={isSaving}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? "保存中..." : "保存"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
