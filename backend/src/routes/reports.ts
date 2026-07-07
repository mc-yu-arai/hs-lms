import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/requireAuth";
import { getUserProgressReport, getCourseReport } from "../services/reportRepository";

export const reportsRouter = Router();

reportsRouter.use(requireAuth(), requireRole("admin", "super_admin"));

// ExcelでBOM無しUTF-8 CSVを開くと文字化けするため、先頭にBOMを付与する
function toCsv(headers: string[], rows: (string | number)[][]): string {
  const escape = (value: string | number) => {
    const s = String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))];
  return "﻿" + lines.join("\r\n");
}

reportsRouter.get(
  "/users",
  asyncHandler(async (_req, res) => {
    const rows = await getUserProgressReport();
    return res.status(200).json({ users: rows });
  }),
);

reportsRouter.get(
  "/courses",
  asyncHandler(async (_req, res) => {
    const rows = await getCourseReport();
    return res.status(200).json({ courses: rows });
  }),
);

reportsRouter.get(
  "/users/csv",
  asyncHandler(async (_req, res) => {
    const rows = await getUserProgressReport();
    const csv = toCsv(
      ["氏名", "部署", "受講コース数", "修了数", "平均進捗率(%)"],
      rows.map((r) => [`${r.lastName} ${r.firstName}`, r.department ?? "", r.courseCount, r.completedCount, r.averageProgressRate]),
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="users_report.csv"');
    return res.status(200).send(csv);
  }),
);

reportsRouter.get(
  "/courses/csv",
  asyncHandler(async (_req, res) => {
    const rows = await getCourseReport();
    const csv = toCsv(
      ["コース名", "受講者数", "修了者数", "修了率(%)", "平均進捗率(%)"],
      rows.map((r) => [r.title, r.enrolledCount, r.completedCount, r.completionRate, r.averageProgressRate]),
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="courses_report.csv"');
    return res.status(200).send(csv);
  }),
);
