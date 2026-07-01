import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/requireAuth";
import { updateProfile, toPublicProfile, type UserProfileUpdate } from "../services/userRepository";
import { requestEmailChange } from "../lib/gotrueRest";
import { uploadAvatar, findAvatarUrl, mimeToExtension } from "../services/avatarStorage";

export const usersRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

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
