import { supabaseAdmin } from "../lib/supabase";

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

function average(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

export async function getUserProgressReport(): Promise<UserProgressReportRow[]> {
  const [{ data: users, error: userError }, { data: enrollments, error: enrollError }] = await Promise.all([
    supabaseAdmin.from("users").select("*"),
    supabaseAdmin.from("enrollments").select("*"),
  ]);
  if (userError) throw userError;
  if (enrollError) throw enrollError;

  return (users ?? []).map((user) => {
    const own = (enrollments ?? []).filter((e) => e.user_id === user.id);
    return {
      userId: user.id,
      lastName: user.last_name,
      firstName: user.first_name,
      department: user.department,
      courseCount: own.length,
      completedCount: own.filter((e) => e.status === "completed").length,
      averageProgressRate: average(own.map((e) => Number(e.progress_rate))),
    };
  });
}

export interface GroupMemberReportRow {
  userId: string;
  lastName: string;
  firstName: string;
  department: string | null;
  courseCount: number;
  completedCount: number;
  averageProgressRate: number;
}

export interface GroupProgressReport {
  groupId: string;
  groupName: string;
  members: GroupMemberReportRow[];
  memberCount: number;
  averageCompletionRate: number;
}

export async function getGroupProgressReport(groupId: string): Promise<GroupProgressReport | null> {
  const { data: group, error: groupError } = await supabaseAdmin.from("groups").select("*").eq("id", groupId).maybeSingle();
  if (groupError) throw groupError;
  if (!group) return null;

  const { data: memberRows, error: memberError } = await supabaseAdmin
    .from("group_members")
    .select("*")
    .eq("group_id", groupId);
  if (memberError) throw memberError;

  const userIds = [...new Set((memberRows ?? []).map((m) => m.user_id as string))];
  if (userIds.length === 0) {
    return { groupId: group.id, groupName: group.name, members: [], memberCount: 0, averageCompletionRate: 0 };
  }

  const [{ data: users, error: userError }, { data: enrollments, error: enrollError }] = await Promise.all([
    supabaseAdmin.from("users").select("*").in("id", userIds),
    supabaseAdmin.from("enrollments").select("*").in("user_id", userIds),
  ]);
  if (userError) throw userError;
  if (enrollError) throw enrollError;

  const members: GroupMemberReportRow[] = (users ?? []).map((user) => {
    const own = (enrollments ?? []).filter((e) => e.user_id === user.id);
    return {
      userId: user.id,
      lastName: user.last_name,
      firstName: user.first_name,
      department: user.department,
      courseCount: own.length,
      completedCount: own.filter((e) => e.status === "completed").length,
      averageProgressRate: average(own.map((e) => Number(e.progress_rate))),
    };
  });

  const completionRates = members.map((m) => (m.courseCount > 0 ? (m.completedCount / m.courseCount) * 100 : 0));

  return {
    groupId: group.id,
    groupName: group.name,
    members,
    memberCount: members.length,
    averageCompletionRate: average(completionRates),
  };
}

export async function getCourseReport(): Promise<CourseReportRow[]> {
  const [{ data: courses, error: courseError }, { data: enrollments, error: enrollError }] = await Promise.all([
    supabaseAdmin.from("courses").select("*"),
    supabaseAdmin.from("enrollments").select("*"),
  ]);
  if (courseError) throw courseError;
  if (enrollError) throw enrollError;

  return (courses ?? []).map((course) => {
    const own = (enrollments ?? []).filter((e) => e.course_id === course.id);
    const completedCount = own.filter((e) => e.status === "completed").length;
    return {
      courseId: course.id,
      title: course.title,
      enrolledCount: own.length,
      completedCount,
      completionRate: own.length > 0 ? Math.round((completedCount / own.length) * 10000) / 100 : 0,
      averageProgressRate: average(own.map((e) => Number(e.progress_rate))),
    };
  });
}
