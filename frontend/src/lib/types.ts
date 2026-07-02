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
