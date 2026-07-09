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

export interface Category {
  id: string;
  name: string;
  createdAt: string;
  courseCount?: number;
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

export type QuestionType = "single_choice" | "multiple_choice";

export interface QuizChoice {
  id: string;
  choiceText: string;
  displayOrder: number;
  isCorrect?: boolean;
}

export interface QuizQuestion {
  id: string;
  questionText: string;
  questionType: QuestionType;
  displayOrder: number;
  choices: QuizChoice[];
}

export interface QuizDetail {
  quiz: { id: string; title: string; description: string | null; passScore: number };
  questions: QuizQuestion[];
}

export interface QuizQuestionResult {
  questionId: string;
  isCorrect: boolean;
  correctChoiceIds: string[];
  selectedChoiceIds: string[];
}

export interface QuizAttemptResult {
  attempt: { id: string; score: number; isPassed: boolean; submittedAt: string };
  questionResults: QuizQuestionResult[];
  enrollment: { id: string; status: EnrollmentStatus; progressRate: number; completedAt: string | null };
}

export interface QuizAttemptSummary {
  id: string;
  score: number;
  isPassed: boolean;
  submittedAt: string;
}

export interface CertificateInfo {
  id: string;
  courseId: string;
  issuedAt: string;
  verificationUuid: string;
}

export interface CertificateVerifyResult {
  valid: boolean;
  certificate?: {
    courseTitle: string;
    learnerName: string;
    issuedAt: string;
  };
}

export interface UserProgressReportRow {
  userId: string;
  lastName: string;
  firstName: string;
  department: string | null;
  courseCount: number;
  completedCount: number;
  averageProgressRate: number;
}

export interface CourseReportRow {
  courseId: string;
  title: string;
  enrolledCount: number;
  completedCount: number;
  completionRate: number;
  averageProgressRate: number;
}

export interface NotificationSettings {
  reminderDaysBefore: number;
  autoSendTime: string;
  isEnabled: boolean;
  updatedAt: string;
}

export type NotificationType = "enrollment_completed" | "course_completed" | "due_date_reminder";

export interface NotificationLog {
  id: string;
  learnerName: string;
  courseTitle: string;
  notificationType: NotificationType;
  isSuccess: boolean;
  errorMessage: string | null;
  sentAt: string;
}

export interface SendRemindersResult {
  sent: number;
  skipped: number;
  failed: number;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
  courseCount?: number;
}

export interface GroupMember {
  id: string;
  addedAt: string;
  user: {
    id: string;
    lastName: string;
    firstName: string;
    email: string;
    department: string | null;
  };
}

export interface GroupCourseAssignment {
  id: string;
  assignedAt: string;
  course: {
    id: string;
    title: string;
    level: "beginner" | "intermediate" | "advanced";
    isPublished: boolean;
  };
}

export interface GroupDetail {
  group: Group;
  members: GroupMember[];
  courses: GroupCourseAssignment[];
}

export interface CsvRowError {
  row: number;
  message: string;
}

export interface GroupProgressReport {
  groupId: string;
  groupName: string;
  members: UserProgressReportRow[];
  memberCount: number;
  averageCompletionRate: number;
}
