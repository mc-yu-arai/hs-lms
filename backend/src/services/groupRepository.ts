import { supabaseAdmin } from "../lib/supabase";
import type { Course } from "./courseRepository";

export interface Group {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  added_at: string;
}

export interface GroupCourse {
  id: string;
  group_id: string;
  course_id: string;
  assigned_at: string;
}

export interface GroupWithCounts extends Group {
  memberCount: number;
  courseCount: number;
}

export async function listGroups(): Promise<GroupWithCounts[]> {
  const [
    { data: groups, error: groupError },
    { data: members, error: memberError },
    { data: courses, error: courseError },
  ] = await Promise.all([
    supabaseAdmin.from("groups").select("*").order("created_at", { ascending: false }),
    supabaseAdmin.from("group_members").select("*"),
    supabaseAdmin.from("group_courses").select("*"),
  ]);
  if (groupError) throw groupError;
  if (memberError) throw memberError;
  if (courseError) throw courseError;

  return (groups ?? []).map((group) => ({
    ...(group as Group),
    memberCount: (members ?? []).filter((m) => m.group_id === group.id).length,
    courseCount: (courses ?? []).filter((c) => c.group_id === group.id).length,
  }));
}

export async function getGroupById(id: string): Promise<Group | null> {
  const { data, error } = await supabaseAdmin.from("groups").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Group | null;
}

export interface GroupInput {
  name: string;
  description?: string | null;
}

export async function createGroup(input: GroupInput): Promise<Group> {
  const { data, error } = await supabaseAdmin
    .from("groups")
    .insert({ name: input.name, description: input.description ?? null })
    .select("*")
    .single();
  if (error) throw error;
  return data as Group;
}

export async function updateGroup(id: string, input: Partial<GroupInput>): Promise<Group | null> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;

  const { data, error } =
    Object.keys(patch).length > 0
      ? await supabaseAdmin.from("groups").update(patch).eq("id", id).select("*").maybeSingle()
      : { data: await getGroupById(id), error: null };
  if (error) throw error;
  return data as Group | null;
}

export async function findGroupByName(name: string): Promise<Group | null> {
  const { data, error } = await supabaseAdmin.from("groups").select("*").eq("name", name).maybeSingle();
  if (error) throw error;
  return data as Group | null;
}

export async function deleteGroup(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("groups").delete().eq("id", id);
  if (error) throw error;
}

export async function listGroupMemberRows(groupId: string): Promise<GroupMember[]> {
  const { data, error } = await supabaseAdmin
    .from("group_members")
    .select("*")
    .eq("group_id", groupId)
    .order("added_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as GroupMember[];
}

export interface GroupMemberWithUser {
  id: string;
  added_at: string;
  user: {
    id: string;
    last_name: string;
    first_name: string;
    email: string;
    department: string | null;
  };
}

// レポート画面等での結合表示用。supabase-jsの埋め込みselect構文はテスト用フェイクDBが
// 対応していないため、courseRepository.tsの既存パターンと同様に2回のクエリでアプリ側結合する。
export async function listGroupMembers(groupId: string): Promise<GroupMemberWithUser[]> {
  const members = await listGroupMemberRows(groupId);
  if (members.length === 0) return [];

  const userIds = [...new Set(members.map((m) => m.user_id))];
  const { data: users, error } = await supabaseAdmin.from("users").select("*").in("id", userIds);
  if (error) throw error;

  const userById = new Map((users ?? []).map((u) => [u.id as string, u]));

  return members.flatMap((member) => {
    const user = userById.get(member.user_id);
    if (!user) return [];
    return [
      {
        id: member.id,
        added_at: member.added_at,
        user: {
          id: user.id,
          last_name: user.last_name,
          first_name: user.first_name,
          email: user.email,
          department: user.department,
        },
      },
    ];
  });
}

export async function findGroupMember(groupId: string, userId: string): Promise<GroupMember | null> {
  const { data, error } = await supabaseAdmin
    .from("group_members")
    .select("*")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as GroupMember | null;
}

// 冪等: 既に所属済みなら既存行を返す
export async function addGroupMember(groupId: string, userId: string): Promise<GroupMember> {
  const existing = await findGroupMember(groupId, userId);
  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from("group_members")
    .insert({ group_id: groupId, user_id: userId })
    .select("*")
    .single();
  if (error) throw error;
  return data as GroupMember;
}

export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  const { error } = await supabaseAdmin.from("group_members").delete().eq("group_id", groupId).eq("user_id", userId);
  if (error) throw error;
}

export async function listGroupCourseRows(groupId: string): Promise<GroupCourse[]> {
  const { data, error } = await supabaseAdmin
    .from("group_courses")
    .select("*")
    .eq("group_id", groupId)
    .order("assigned_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as GroupCourse[];
}

export interface GroupCourseWithCourse {
  id: string;
  assigned_at: string;
  course: Course;
}

export async function listGroupCourses(groupId: string): Promise<GroupCourseWithCourse[]> {
  const rows = await listGroupCourseRows(groupId);
  if (rows.length === 0) return [];

  const courseIds = [...new Set(rows.map((r) => r.course_id))];
  const { data: courses, error } = await supabaseAdmin.from("courses").select("*").in("id", courseIds);
  if (error) throw error;

  const courseById = new Map((courses ?? []).map((c) => [c.id as string, c as Course]));

  return rows.flatMap((row) => {
    const course = courseById.get(row.course_id);
    return course ? [{ id: row.id, assigned_at: row.assigned_at, course }] : [];
  });
}

export async function findGroupCourse(groupId: string, courseId: string): Promise<GroupCourse | null> {
  const { data, error } = await supabaseAdmin
    .from("group_courses")
    .select("*")
    .eq("group_id", groupId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (error) throw error;
  return data as GroupCourse | null;
}

// 冪等: 既に割り当て済みなら既存行を返す
export async function assignGroupCourse(groupId: string, courseId: string): Promise<GroupCourse> {
  const existing = await findGroupCourse(groupId, courseId);
  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from("group_courses")
    .insert({ group_id: groupId, course_id: courseId })
    .select("*")
    .single();
  if (error) throw error;
  return data as GroupCourse;
}

export async function removeGroupCourse(groupId: string, courseId: string): Promise<void> {
  const { error } = await supabaseAdmin.from("group_courses").delete().eq("group_id", groupId).eq("course_id", courseId);
  if (error) throw error;
}
