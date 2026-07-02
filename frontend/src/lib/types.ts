export type UserRole = "learner" | "admin" | "super_admin";

export interface AuthUser {
  id: string;
  email: string;
  lastName: string;
  firstName: string;
  role: UserRole;
  department?: string | null;
  hireDate?: string | null;
  isActive?: boolean;
  lastLoginAt?: string | null;
  totpEnabled?: boolean;
  avatarUrl?: string | null;
}

export interface Course {
  id: string;
  title: string;
  description: string | null;
  categoryId: string | null;
  level: "beginner" | "intermediate" | "advanced";
  durationMinutes: number | null;
  passScore: number;
  isPublished: boolean;
  isMandatory: boolean;
  thumbnailUrl: string | null;
  prerequisiteCourseId: string | null;
}

export type EnrollmentStatus = "enrolled" | "in_progress" | "completed" | "expired";

export interface EnrollmentSummary {
  id: string;
  status: EnrollmentStatus;
  progressRate: number;
  totalStudyTime: number;
  startedAt: string | null;
  completedAt: string | null;
  dueDate: string | null;
  course: {
    id: string;
    title: string;
    level: "beginner" | "intermediate" | "advanced";
    durationMinutes: number | null;
    isMandatory: boolean;
    thumbnailUrl: string | null;
  };
}

export type LessonContentType = "video" | "pdf" | "text" | "scorm";

export interface LessonSummary {
  id: string;
  title: string;
  contentType: LessonContentType;
  durationSeconds: number | null;
  displayOrder: number;
  contentUrl: string | null;
  contentBody: string | null;
}

export interface ChapterSummary {
  id: string;
  title: string;
  displayOrder: number;
  lessons: LessonSummary[];
}

export interface CourseDetail {
  course: Course;
  chapters: ChapterSummary[];
  enrolled: boolean;
}

export interface EnrollmentDetail {
  id: string;
  status: EnrollmentStatus;
  progressRate: number;
  totalStudyTime: number;
  startedAt: string | null;
  completedAt: string | null;
  dueDate: string | null;
}

export interface LessonProgressSummary {
  lessonId: string;
  title: string;
  isCompleted: boolean;
  progressPercent: number;
  lastPositionSeconds: number | null;
}

export interface CourseProgress {
  enrollment: EnrollmentDetail;
  lessons: LessonProgressSummary[];
}
