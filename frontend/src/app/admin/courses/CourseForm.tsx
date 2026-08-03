"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import type {
  Category,
  Course,
  CourseDetail,
  LessonContentType,
  LessonContentUploadResult,
  LessonVideoUploadResult,
  ScormVersion,
} from "@/lib/types";
import { CourseGroupsSection } from "./CourseGroupsSection";

const CONTENT_TYPE_OPTIONS: { value: LessonContentType; label: string }[] = [
  { value: "video", label: "動画" },
  { value: "pdf", label: "PDF" },
  { value: "text", label: "テキスト" },
  { value: "scorm", label: "SCORM" },
  { value: "learnwiz", label: "LearnWiz" },
];

const ZIP_CONTENT_TYPES: LessonContentType[] = ["scorm", "learnwiz"];

interface LessonDraft {
  key: string;
  title: string;
  contentType: LessonContentType;
  contentUrl: string;
  contentBody: string;
  durationSeconds: string;
  scormVersion: ScormVersion | null;
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
  return { key: newKey(), title: "", contentType: "text", contentUrl: "", contentBody: "", durationSeconds: "", scormVersion: null };
}

function newChapter(): ChapterDraft {
  return { key: newKey(), title: "", lessons: [newLesson()] };
}

function FileDropzone({
  id,
  accept,
  uploading,
  label,
  onFileSelected,
}: {
  id: string;
  accept: string;
  uploading: boolean;
  label: string;
  onFileSelected: (file: File) => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <label
      htmlFor={id}
      onDragOver={(e) => {
        e.preventDefault();
        if (!uploading) setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (uploading) return;
        const file = e.dataTransfer.files?.[0];
        if (file) onFileSelected(file);
      }}
      className={`flex items-center gap-3 rounded-lg border-2 border-dashed px-4 py-3 text-sm transition-colors ${
        uploading
          ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400"
          : isDragOver
            ? "cursor-pointer border-blue-400 bg-blue-50 text-blue-700"
            : "cursor-pointer border-gray-300 bg-white text-gray-600 hover:border-blue-400 hover:bg-blue-50/50"
      }`}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6 flex-shrink-0">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 16.5V9m0 0-3 3m3-3 3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
        />
      </svg>
      <span>
        <span className="font-medium">{uploading ? "アップロード中..." : label}</span>
        {!uploading && <span className="block text-xs text-gray-400">クリックして選択、またはドラッグ＆ドロップ</span>}
      </span>
      <input
        id={id}
        type="file"
        accept={accept}
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelected(file);
          e.target.value = "";
        }}
        className="hidden"
      />
    </label>
  );
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
  isLimited: boolean;
  thumbnailUrl: string | null;
  prerequisiteCourseId: string | null;
  chapters: {
    title: string;
    lessons: {
      title: string;
      contentType: LessonContentType;
      contentUrl: string | null;
      contentBody: string | null;
      durationSeconds: number | null;
      scormVersion: ScormVersion | null;
    }[];
  }[];
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
  const [isLimited, setIsLimited] = useState(initial?.course.isLimited ?? false);
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
                  scormVersion: l.scormVersion ?? null,
                }))
              : [newLesson()],
        }))
      : [newChapter()],
  );

  const [otherCourses, setOtherCourses] = useState<Course[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadState, setUploadState] = useState<Record<string, { status: "uploading" | "error"; message?: string }>>({});

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

  async function handleZipSelected(chapterKey: string, lessonKey: string, file: File) {
    setUploadState((prev) => ({ ...prev, [lessonKey]: { status: "uploading" } }));
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await authFetch<LessonContentUploadResult>("/v1/uploads/lesson-content", {
        method: "POST",
        body: formData,
      });
      updateLesson(chapterKey, lessonKey, {
        contentType: result.contentType,
        contentUrl: result.contentUrl,
        scormVersion: result.scormVersion,
      });
      setUploadState((prev) => {
        const next = { ...prev };
        delete next[lessonKey];
        return next;
      });
    } catch (err) {
      setUploadState((prev) => ({
        ...prev,
        [lessonKey]: { status: "error", message: err instanceof ApiError ? err.message : "アップロードに失敗しました" },
      }));
    }
  }

  async function handleVideoSelected(chapterKey: string, lessonKey: string, file: File) {
    setUploadState((prev) => ({ ...prev, [lessonKey]: { status: "uploading" } }));
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await authFetch<LessonVideoUploadResult>("/v1/uploads/lesson-video", {
        method: "POST",
        body: formData,
      });
      updateLesson(chapterKey, lessonKey, { contentUrl: result.contentUrl });
      setUploadState((prev) => {
        const next = { ...prev };
        delete next[lessonKey];
        return next;
      });
    } catch (err) {
      setUploadState((prev) => ({
        ...prev,
        [lessonKey]: { status: "error", message: err instanceof ApiError ? err.message : "アップロードに失敗しました" },
      }));
    }
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
      isLimited,
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
          scormVersion: l.contentType === "scorm" ? l.scormVersion : null,
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
    <div className="space-y-6">
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
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isLimited} onChange={(e) => setIsLimited(e.target.checked)} className="h-4 w-4" />
            限定公開にする（割り当てたグループのメンバーのみ閲覧・受講登録可能）
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
                      ) : ZIP_CONTENT_TYPES.includes(lesson.contentType) ? (
                        <div className="sm:col-span-2 space-y-2">
                          <FileDropzone
                            id={`zip-upload-${lesson.key}`}
                            accept=".zip"
                            uploading={uploadState[lesson.key]?.status === "uploading"}
                            label="zipファイルを選択"
                            onFileSelected={(file) => handleZipSelected(chapter.key, lesson.key, file)}
                          />
                          {lesson.contentType === "scorm" && (
                            <label className="flex items-center gap-1 text-xs text-gray-600">
                              SCORMバージョン:
                              <select
                                value={lesson.scormVersion ?? ""}
                                onChange={(e) =>
                                  updateLesson(chapter.key, lesson.key, { scormVersion: (e.target.value || null) as ScormVersion | null })
                                }
                                className="rounded-md border border-gray-300 px-1.5 py-1 text-xs"
                              >
                                <option value="">未判定</option>
                                <option value="1.2">1.2</option>
                                <option value="2004">2004</option>
                              </select>
                            </label>
                          )}
                          {uploadState[lesson.key]?.status === "error" && (
                            <p role="alert" className="text-xs text-red-600">
                              {uploadState[lesson.key]?.message}
                            </p>
                          )}
                          {lesson.contentUrl && <p className="truncate text-xs text-gray-500">格納先: {lesson.contentUrl}</p>}
                        </div>
                      ) : lesson.contentType === "video" ? (
                        <div className="sm:col-span-2 space-y-2">
                          <FileDropzone
                            id={`video-upload-${lesson.key}`}
                            accept=".mp4,.mov,.avi,video/mp4,video/quicktime,video/x-msvideo"
                            uploading={uploadState[lesson.key]?.status === "uploading"}
                            label="動画ファイルを選択（MP4・MOV・AVI）"
                            onFileSelected={(file) => handleVideoSelected(chapter.key, lesson.key, file)}
                          />
                          {uploadState[lesson.key]?.status === "error" && (
                            <p role="alert" className="text-xs text-red-600">
                              {uploadState[lesson.key]?.message}
                            </p>
                          )}
                          {lesson.contentUrl && <p className="truncate text-xs text-gray-500">格納先: {lesson.contentUrl}</p>}
                        </div>
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

      {initial && <CourseGroupsSection courseId={initial.course.id} />}
    </div>
  );
}
