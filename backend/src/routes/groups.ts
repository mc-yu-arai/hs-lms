import { Router } from "express";
import { z } from "zod";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/requireAuth";
import {
  listGroups,
  getGroupById,
  createGroup,
  updateGroup,
  deleteGroup,
  listGroupMembers,
  removeGroupMember,
  listGroupCourses,
  removeGroupCourse,
  type Group,
  type GroupWithCounts,
} from "../services/groupRepository";
import { findUserById } from "../services/userRepository";
import { getCourseById } from "../services/courseRepository";
import { addGroupMemberAndSyncEnrollments, assignGroupCourseAndSyncEnrollments } from "../services/groupService";

export const groupsRouter = Router();

groupsRouter.use(requireAuth(), requireRole("admin", "super_admin"));

function serializeGroup(group: Group | GroupWithCounts) {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    createdAt: group.created_at,
    updatedAt: group.updated_at,
    ...("memberCount" in group ? { memberCount: group.memberCount, courseCount: group.courseCount } : {}),
  };
}

async function requireGroup(id: string): Promise<Group> {
  const group = await getGroupById(id);
  if (!group) throw new HttpError(404, "group_not_found", "グループが見つかりません");
  return group;
}

groupsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const groups = await listGroups();
    return res.status(200).json({ groups: groups.map(serializeGroup) });
  }),
);

const groupInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().nullable().optional(),
});

groupsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = groupInputSchema.parse(req.body);
    const group = await createGroup(input);
    return res.status(201).json({ group: serializeGroup(group) });
  }),
);

groupsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const group = await requireGroup(req.params.id);
    const [members, courses] = await Promise.all([listGroupMembers(group.id), listGroupCourses(group.id)]);

    return res.status(200).json({
      group: serializeGroup(group),
      members: members.map((m) => ({
        id: m.id,
        addedAt: m.added_at,
        user: {
          id: m.user.id,
          lastName: m.user.last_name,
          firstName: m.user.first_name,
          email: m.user.email,
          department: m.user.department,
        },
      })),
      courses: courses.map((c) => ({
        id: c.id,
        assignedAt: c.assigned_at,
        course: { id: c.course.id, title: c.course.title, level: c.course.level, isPublished: c.course.is_published },
      })),
    });
  }),
);

const groupUpdateSchema = groupInputSchema.partial();

groupsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    await requireGroup(req.params.id);
    const input = groupUpdateSchema.parse(req.body);
    const group = await updateGroup(req.params.id, input);
    return res.status(200).json({ group: serializeGroup(group!) });
  }),
);

groupsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await requireGroup(req.params.id);
    await deleteGroup(req.params.id);
    return res.status(200).json({ message: "グループを削除しました" });
  }),
);

const memberInputSchema = z.object({
  userId: z.string().min(1),
});

groupsRouter.post(
  "/:id/members",
  asyncHandler(async (req, res) => {
    await requireGroup(req.params.id);
    const { userId } = memberInputSchema.parse(req.body);

    const user = await findUserById(userId);
    if (!user) throw new HttpError(404, "user_not_found", "ユーザーが見つかりません");

    const member = await addGroupMemberAndSyncEnrollments(req.params.id, userId);
    return res.status(201).json({ member: { id: member.id, addedAt: member.added_at, userId: member.user_id } });
  }),
);

groupsRouter.delete(
  "/:id/members",
  asyncHandler(async (req, res) => {
    await requireGroup(req.params.id);
    const { userId } = memberInputSchema.parse(req.body);
    await removeGroupMember(req.params.id, userId);
    return res.status(200).json({ message: "メンバーを削除しました" });
  }),
);

const courseInputSchema = z.object({
  courseId: z.string().min(1),
});

groupsRouter.post(
  "/:id/courses",
  asyncHandler(async (req, res) => {
    await requireGroup(req.params.id);
    const { courseId } = courseInputSchema.parse(req.body);

    const course = await getCourseById(courseId);
    if (!course) throw new HttpError(404, "course_not_found", "コースが見つかりません");

    const groupCourse = await assignGroupCourseAndSyncEnrollments(req.params.id, courseId);
    return res
      .status(201)
      .json({ groupCourse: { id: groupCourse.id, assignedAt: groupCourse.assigned_at, courseId: groupCourse.course_id } });
  }),
);

groupsRouter.delete(
  "/:id/courses",
  asyncHandler(async (req, res) => {
    await requireGroup(req.params.id);
    const { courseId } = courseInputSchema.parse(req.body);
    await removeGroupCourse(req.params.id, courseId);
    return res.status(200).json({ message: "コースの割り当てを解除しました" });
  }),
);
