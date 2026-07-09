"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import type { Category, Course, CourseDetail, LessonContentType } from "@/lib/types";

const CONTENT_TYPE_OPTIONS: { value: LessonContentType; label: string }[] = [
  { value: "video", label: "動画" },
  { value: "pdf", label: "PDF" },
  { value: "text", label: "テキスト" },
  { value: "scorm", label: "SCORM" },
];

interface LessonDraft {
  key: string;
  title: string;
  contentType: LessonContentType;
  contentUrl: string;
  contentBody: string;
  durationSeconds: string;
}

interface ChapterDraft {
  key: string;
  title: string;
  lessons: LessonDraft[];
}

function newKey() {
  return Math.random().toString(36).slice(2, 10);
}

function newLesson(): LessonDraft {
  return { key: newKey(), title: "", contentType: "text", contentUrl: "", contentBody: "", durationSeconds: "" };
}

function newChapter(): ChapterDraft {
  return { key: newKey(), title: "", lessons: [newLesson()] };
}

export interface CourseFormValues {
  title: string;
  description: string | null;
  categoryId: string | null;
  level: Course["level"];
  durationMinutes: number | null;
  passScore: number;
  isPublished: boolean;
  isMandatory: boolean;
  thumbnailUrl: string | null;
  prerequisiteCourseId: string | null;
  chapters: { title: string; lessons: { title: string; contentType: LessonContentType; contentUrl: string | null; contentBody: string | null; durationSeconds: number | null }[] }[];
}

export function CourseForm({
  initial,
  submitLabel,
  onSubmit,
  excludeCourseId,
}: {
  initial?: CourseDetail;
  submitLabel: string;
  onSubmit: (values: CourseFormValues) => Promise<void>;
  excludeCourseId?: string;
}) {
  const { authFetch } = useAuth();

  const [title, setTitle] = useState(initial?.course.title ?? "");
  const [description, setDescription] = useState(initial?.course.description ?? "");
  const [categoryId, setCategoryId] = useState(initial?.course.categoryId ?? "");
  const [level, setLevel] = useState<Course["level"]>(initial?.course.level ?? "beginner");
  const [durationMinutes, setDurationMinutes] = useState(initial?.course.durationMinutes?.toString() ?? "");
  const [passScore, setPassScore] = useState(initial?.course.passScore?.toString() ?? "70");
  const [isPublished, setIsPublished] = useState(initial?.course.isPublished ?? false);
  const [isMandatory, setIsMandatory] = useState(initial?.course.isMandatory ?? false);
  const [thumbnailUrl, setThumbnailUrl] = useState(initial?.course.thumbnailUrl ?? "");
  const [prerequisiteCourseId, setPrerequisiteCourseId] = useState(initial?.course.prerequisiteCourseId ?? "");
  const [chapters, setChapters] = useState<ChapterDraft[]>(
    initial && initial.chapters.length > 0
      ? initial.chapters.map((c) => ({
          key: newKey(),
          title: c.title,
          lessons:
            c.lessons.length > 0
              ? c.lessons.map((l) => ({
                  key: newKey(),
                  title: l.title,
                  contentType: l.contentType,
                  contentUrl: l.contentUrl ?? "",
                  contentBody: l.contentBody ?? "",
                  durationSeconds: l.durationSeconds?.toString() ?? "",
                }))
              : [newLesson()],
        }))
      : [newChapter()],
  );

  const [otherCourses, setOtherCourses] = useState<Course[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    authFetch<{ courses: Course[] }>("/v1/courses")
      .then((res) => setOtherCourses(res.courses.filter((c) => c.id !== excludeCourseId)))
      .catch(() => undefined);
    authFetch<{ categories: Category[] }>("/v1/categories")
      .then((res) => setCategories(res.categories))
      .catch(() => undefined);
  }, [authFetch, excludeCourseId]);

  function updateChapter(key: string, patch: Partial<ChapterDraft>) {
    setChapters((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  function updateLesson(chapterKey: string, lessonKey: string, patch: Partial<LessonDraft>) {
    setChapters((prev) =>
      prev.map((c) =>
        c.key !== chapterKey ? c : { ...c, lessons: c.lessons.map((l) => (l.key === lessonKey ? { ...l, ...patch } : l)) },
      ),
    );
  }

  function moveItem<T>(arr: T[], index: number, direction: -1 | 1): T[] {
    const target = index + direction;
    if (target < 0 || target >= arr.length) return arr;
    const next = [...arr];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  }

  function moveChapter(index: number, direction: -1 | 1) {
    setChapters((prev) => moveItem(prev, index, direction));
  }

  function moveLesson(chapterKey: string, index: number, direction: -1 | 1) {
    setChapters((prev) =>
      prev.map((c) => (c.key !== chapterKey ? c : { ...c, lessons: moveItem(c.lessons, index, direction) })),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const values: CourseFormValues = {
      title,
      description: description || null,
      categoryId: categoryId || null,
      level,
      durationMinutes: durationMinutes ? Number(durationMinutes) : null,
      passScore: passScore ? Number(passScore) : 70,
      isPublished,
      isMandatory,
      thumbnailUrl: thumbnailUrl || null,
      prerequisiteCourseId: prerequisiteCourseId || null,
      chapters: chapters.map((c) => ({
        title: c.title,
        lessons: c.lessons.map((l) => ({
          title: l.title,
          contentType: l.contentType,
          contentUrl: l.contentType === "text" ? null : l.contentUrl || null,
          contentBody: l.contentType === "text" ? l.contentBody || null : null,
          durationSeconds: l.durationSeconds ? Number(l.durationSeconds) : null,
        })),
      })),
    };

    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "保存に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-base font-semibold text-gray-900">基本情報</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-gray-700">タイトル</span>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-gray-700">レベル</span>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as Course["level"])}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="beginner">初級</option>
              <option value="intermediate">中級</option>
              <option value="advanced">上級</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-gray-700">カテゴリ</span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">未分類</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-gray-700">説明</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-gray-700">学習時間目安（分）</span>
            <input
              type="number"
              min={0}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-gray-700">合格点（修了テスト）</span>
            <input
              type="number"
              min={0}
              max={100}
              value={passScore}
              onChange={(e) => setPassScore(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-gray-700">サムネイルURL</span>
            <input
              value={thumbnailUrl}
              onChange={(e) => setThumbnailUrl(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-gray-700">前提コース</span>
            <select
              value={prerequisiteCourseId}
              onChange={(e) => setPrerequisiteCourseId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">なし</option>
              {otherCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} className="h-4 w-4" />
            公開する
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isMandatory} onChange={(e) => setIsMandatory(e.target.checked)} className="h-4 w-4" />
            必須コースにする
          </label>
        </div>
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">カリキュラム（章・レッスン）</h3>
          <button
            type="button"
            onClick={() => setChapters((prev) => [...prev, newChapter()])}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            + 章を追加
          </button>
        </div>

        <div className="space-y-6">
          {chapters.map((chapter, chapterIndex) => (
            <div key={chapter.key} className="rounded-md border border-gray-200 p-4">
              <div className="mb-3 flex items-center gap-2">
                <input
                  required
                  placeholder="章タイトル"
                  value={chapter.title}
                  onChange={(e) => updateChapter(chapter.key, { title: e.target.value })}
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
                <button type="button" onClick={() => moveChapter(chapterIndex, -1)} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
                  ↑
                </button>
                <button type="button" onClick={() => moveChapter(chapterIndex, 1)} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => setChapters((prev) => prev.filter((c) => c.key !== chapter.key))}
                  disabled={chapters.length <= 1}
                  className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  章を削除
                </button>
              </div>

              <div className="space-y-3 pl-4">
                {chapter.lessons.map((lesson, lessonIndex) => (
                  <div key={lesson.key} className="rounded-md border border-gray-100 bg-gray-50 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <input
                        required
                        placeholder="レッスンタイトル"
                        value={lesson.title}
                        onChange={(e) => updateLesson(chapter.key, lesson.key, { title: e.target.value })}
                        className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                      />
                      <select
                        value={lesson.contentType}
                        onChange={(e) => updateLesson(chapter.key, lesson.key, { contentType: e.target.value as LessonContentType })}
                        className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      >
                        {CONTENT_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={() => moveLesson(chapter.key, lessonIndex, -1)} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-white">
                        ↑
                      </button>
                      <button type="button" onClick={() => moveLesson(chapter.key, lessonIndex, 1)} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-white">
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => updateChapter(chapter.key, { lessons: chapter.lessons.filter((l) => l.key !== lesson.key) })}
                        disabled={chapter.lessons.length <= 1}
                        className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"
                      >
                        削除
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {lesson.contentType === "text" ? (
                        <textarea
                          placeholder="本文"
                          value={lesson.contentBody}
                          onChange={(e) => updateLesson(chapter.key, lesson.key, { contentBody: e.target.value })}
                          rows={2}
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm sm:col-span-2"
                        />
                      ) : (
                        <input
                          placeholder="コンテンツURL"
                          value={lesson.contentUrl}
                          onChange={(e) => updateLesson(chapter.key, lesson.key, { contentUrl: e.target.value })}
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                        />
                      )}
                      <input
                        type="number"
                        min={0}
                        placeholder="再生時間（秒）"
                        value={lesson.durationSeconds}
                        onChange={(e) => updateLesson(chapter.key, lesson.key, { durationSeconds: e.target.value })}
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                      />
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => updateChapter(chapter.key, { lessons: [...chapter.lessons, newLesson()] })}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  + レッスンを追加
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
      >
        {isSubmitting ? "保存中..." : submitLabel}
      </button>
    </form>
  );
}
