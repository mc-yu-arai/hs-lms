import { Router } from "express";
import { z } from "zod";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/requireAuth";
import {
  listCategories,
  getCategoryById,
  findCategoryByName,
  createCategory,
  updateCategory,
  deleteCategory,
  countCoursesForCategory,
  type Category,
  type CategoryWithCourseCount,
} from "../services/categoryRepository";

export const categoriesRouter = Router();

function serializeCategory(category: Category | CategoryWithCourseCount) {
  return {
    id: category.id,
    name: category.name,
    createdAt: category.created_at,
    ...("courseCount" in category ? { courseCount: category.courseCount } : {}),
  };
}

// コース作成フォーム等でも利用するため認証不要
categoriesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const categories = await listCategories();
    return res.status(200).json({ categories: categories.map(serializeCategory) });
  }),
);

const categoryInputSchema = z.object({
  name: z.string().min(1).max(100),
});

categoriesRouter.post(
  "/",
  requireAuth(),
  requireRole("admin", "super_admin"),
  asyncHandler(async (req, res) => {
    const { name } = categoryInputSchema.parse(req.body);

    const existing = await findCategoryByName(name);
    if (existing) throw new HttpError(409, "category_name_exists", "同じ名前のカテゴリが既に存在します");

    const category = await createCategory(name);
    return res.status(201).json({ category: serializeCategory(category) });
  }),
);

categoriesRouter.put(
  "/:id",
  requireAuth(),
  requireRole("admin", "super_admin"),
  asyncHandler(async (req, res) => {
    const existing = await getCategoryById(req.params.id);
    if (!existing) throw new HttpError(404, "category_not_found", "カテゴリが見つかりません");

    const { name } = categoryInputSchema.parse(req.body);

    const duplicate = await findCategoryByName(name);
    if (duplicate && duplicate.id !== req.params.id) {
      throw new HttpError(409, "category_name_exists", "同じ名前のカテゴリが既に存在します");
    }

    const category = await updateCategory(req.params.id, name);
    return res.status(200).json({ category: serializeCategory(category!) });
  }),
);

categoriesRouter.delete(
  "/:id",
  requireAuth(),
  requireRole("admin", "super_admin"),
  asyncHandler(async (req, res) => {
    const existing = await getCategoryById(req.params.id);
    if (!existing) throw new HttpError(404, "category_not_found", "カテゴリが見つかりません");

    const courseCount = await countCoursesForCategory(req.params.id);
    if (courseCount > 0) {
      throw new HttpError(
        409,
        "category_has_courses",
        `このカテゴリには${courseCount}件のコースが紐付いているため削除できません`,
      );
    }

    await deleteCategory(req.params.id);
    return res.status(200).json({ message: "カテゴリを削除しました" });
  }),
);
