import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { findCertificateByVerificationUuid } from "../services/certificateRepository";
import { getCourseById } from "../services/courseRepository";
import { findUserById } from "../services/userRepository";

export const certificatesRouter = Router();

// QRコード読み取り・URL共有からの検証用。個人情報漏洩を避けるためメールアドレス等は含めない
certificatesRouter.get(
  "/:uuid/verify",
  asyncHandler(async (req, res) => {
    const certificate = await findCertificateByVerificationUuid(req.params.uuid);
    if (!certificate) {
      return res.status(404).json({ valid: false });
    }

    const [course, user] = await Promise.all([getCourseById(certificate.course_id), findUserById(certificate.user_id)]);
    if (!course || !user) {
      return res.status(404).json({ valid: false });
    }

    return res.status(200).json({
      valid: true,
      certificate: {
        courseTitle: course.title,
        learnerName: `${user.last_name} ${user.first_name}`,
        issuedAt: certificate.issued_at,
      },
    });
  }),
);
