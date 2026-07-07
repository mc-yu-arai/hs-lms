import { findEnrollment, createEnrollment } from "./courseRepository";
import { notifyEnrollmentCompleted } from "./notificationService";
import {
  addGroupMember,
  assignGroupCourse,
  listGroupCourseRows,
  listGroupMemberRows,
  type GroupMember,
  type GroupCourse,
} from "./groupRepository";

// 受講登録が無ければ作成し、通知フックも既存の自己受講登録(POST /courses/:id/enroll)と揃える
async function ensureEnrollment(userId: string, courseId: string): Promise<void> {
  const existing = await findEnrollment(userId, courseId);
  if (existing) return;
  await createEnrollment(userId, courseId);
  await notifyEnrollmentCompleted(userId, courseId);
}

// メンバー追加時、そのグループに既に割り当て済みのコース全てへ受講登録を同期する
export async function addGroupMemberAndSyncEnrollments(groupId: string, userId: string): Promise<GroupMember> {
  const member = await addGroupMember(groupId, userId);
  const groupCourses = await listGroupCourseRows(groupId);
  for (const gc of groupCourses) {
    await ensureEnrollment(userId, gc.course_id);
  }
  return member;
}

// コース割り当て時、現時点のグループメンバー全員に受講登録を作成する
export async function assignGroupCourseAndSyncEnrollments(groupId: string, courseId: string): Promise<GroupCourse> {
  const groupCourse = await assignGroupCourse(groupId, courseId);
  const members = await listGroupMemberRows(groupId);
  for (const member of members) {
    await ensureEnrollment(member.user_id, courseId);
  }
  return groupCourse;
}
