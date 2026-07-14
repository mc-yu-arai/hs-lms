import { Router } from "express";
import multer from "multer";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/requireAuth";
import { extractAndUploadLessonContent, LessonContentError } from "../services/lessonContentStorage";

export const uploadsRouter = Router();

const MAX_LESSON_CONTENT_SIZE = 300 * 1024 * 1024; // 300MB

const lessonContentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LESSON_CONTENT_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith(".zip")) {
      cb(new HttpError(400, "invalid_file", "zipファイルを指定してください"));
      return;
    }
    cb(null, true);
  },
});

uploadsRouter.post(
  "/lesson-content",
  requireAuth(),
  requireRole("admin", "super_admin"),
  lessonContentUpload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, "invalid_file", "zipファイルを指定してください");

    try {
      const result = await extractAndUploadLessonContent(req.file.buffer);
      return res.status(201).json(result);
    } catch (err) {
      if (err instanceof LessonContentError) {
        throw new HttpError(400, "invalid_lesson_content", err.message);
      }
      throw err;
    }
  }),
);
