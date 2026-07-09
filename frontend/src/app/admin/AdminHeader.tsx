"use client";

export function AdminHeader() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-6">
          <a href="/dashboard" className="text-lg font-bold text-gray-900">
            HS-LMS
          </a>
          <nav className="flex gap-4 text-sm">
            <a href="/admin/courses" className="text-gray-600 transition-colors hover:text-gray-900">
              コース管理
            </a>
            <a href="/admin/categories" className="text-gray-600 transition-colors hover:text-gray-900">
              カテゴリ
            </a>
            <a href="/admin/users" className="text-gray-600 transition-colors hover:text-gray-900">
              ユーザー管理
            </a>
            <a href="/admin/groups" className="text-gray-600 transition-colors hover:text-gray-900">
              グループ
            </a>
            <a href="/admin/reports" className="text-gray-600 transition-colors hover:text-gray-900">
              レポート
            </a>
            <a href="/admin/notifications" className="text-gray-600 transition-colors hover:text-gray-900">
              通知
            </a>
          </nav>
        </div>
        <a href="/dashboard" className="text-sm text-gray-500 transition-colors hover:text-gray-700">
          ダッシュボードに戻る
        </a>
      </div>
    </header>
  );
}
