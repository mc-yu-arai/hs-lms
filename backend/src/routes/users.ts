import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/requireAuth";
import {
  updateProfile,
  toPublicProfile,
  listUsers,
  findUserById,
  updateUserAsAdmin,
  type UserProfileUpdate,
} from "../services/userRepository";
import { requestEmailChange } from "../lib/gotrueRest";
import { uploadAvatar, findAvatarUrl, mimeToExtension } from "../services/avatarStorage";
import { listEnrollmentsForUser } from "../services/courseRepository";

export const usersRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

const listUsersQuerySchema = z.object({
  keyword: z.string().optional(),
  role: z.enum(["learner", "admin", "super_admin"]).optional(),
  isActive: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

usersRouter.get(
  "/",
  requireAuth(),
  requireRole("admin", "super_admin"),
  asyncHandler(async (req, res) => {
    const { keyword, role, isActive } = listUsersQuerySchema.parse(req.query);
    const users = await listUsers({ keyword, role, isActive });
    return res.status(200).json({ users: users.map((u) => toPublicProfile(u)) });
  }),
);

usersRouter.get(
  "/me",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const avatarUrl = await findAvatarUrl(req.appUser!.id);
    return res.status(200).json({ user: toPublicProfile(req.appUser!, avatarUrl) });
  }),
);

const updateProfileSchema = z.object({
  lastName: z.string().min(1).max(50).optional(),
  firstName: z.string().min(1).max(50).optional(),
  department: z.string().max(100).nullable().optional(),
  email: z.string().email().optional(),
});

usersRouter.put(
  "/me",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const body = updateProfileSchema.parse(req.body);
    const user = req.appUser!;

    let emailChangeRequested = false;
    if (body.email && body.email !== user.email) {
      const accessToken = req.headers.authorization!.slice("Bearer ".length);
      await requestEmailChange(accessToken, body.email);
      emailChangeRequested = true;
    }

    const patch: UserProfileUpdate = {};
    if (body.lastName !== undefined) patch.last_name = body.lastName;
    if (body.firstName !== undefined) patch.first_name = body.firstName;
    if (body.department !== undefined) patch.department = body.department;

    const updated = Object.keys(patch).length > 0 ? await updateProfile(user.id, patch) : user;
    const avatarUrl = await findAvatarUrl(user.id);

    return res.status(200).json({
      user: toPublicProfile(updated ?? user, avatarUrl),
      emailChangeRequested,
    });
  }),
);

usersRouter.get(
  "/me/enrollments",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const rows = await listEnrollmentsForUser(req.appUser!.id);

    const enrollments = rows.map(({ enrollment, course }) => ({
      id: enrollment.id,
      status: enrollment.status,
      progressRate: enrollment.progress_rate,
      totalStudyTime: enrollment.total_study_time,
      startedAt: enrollment.started_at,
      completedAt: enrollment.completed_at,
      dueDate: enrollment.due_date,
      course: {
        id: course.id,
        title: course.title,
        level: course.level,
        durationMinutes: course.duration_minutes,
        isMandatory: course.is_mandatory,
        thumbnailUrl: course.thumbnail_url,
      },
    }));

    return res.status(200).json({ enrollments });
  }),
);

usersRouter.post(
  "/me/avatar",
  requireAuth(),
  upload.single("avatar"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new HttpError(400, "file_required", "画像ファイルを指定してください");
    }
    if (!mimeToExtension(req.file.mimetype)) {
      throw new HttpError(400, "invalid_file_type", "JPEGまたはPNG画像のみアップロードできます");
    }

    const avatarUrl = await uploadAvatar(req.appUser!.id, req.file.buffer, req.file.mimetype);
    return res.status(200).json({ avatarUrl });
  }),
);

const adminUpdateUserSchema = z.object({
  role: z.enum(["learner", "admin", "super_admin"]).optional(),
  isActive: z.boolean().optional(),
});

usersRouter.put(
  "/:id",
  requireAuth(),
  requireRole("admin", "super_admin"),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.appUser!.id) {
      throw new HttpError(400, "self_modification_forbidden", "自分自身のロール・有効状態は変更できません");
    }

    const existing = await findUserById(req.params.id);
    if (!existing) throw new HttpError(404, "user_not_found", "ユーザーが見つかりません");

    const patch = adminUpdateUserSchema.parse(req.body);
    const updated = await updateUserAsAdmin(req.params.id, patch);
    return res.status(200).json({ user: toPublicProfile(updated ?? existing) });
  }),
);
