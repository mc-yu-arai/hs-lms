import { supabaseAdmin } from "../lib/supabase";

export interface Category {
  id: string;
  name: string;
  created_at: string;
}

export interface CategoryWithCourseCount extends Category {
  courseCount: number;
}

export async function listCategories(): Promise<CategoryWithCourseCount[]> {
  const [{ data: categories, error: categoryError }, { data: courses, error: courseError }] = await Promise.all([
    supabaseAdmin.from("categories").select("*").order("created_at", { ascending: true }),
    supabaseAdmin.from("courses").select("*"),
  ]);
  if (categoryError) throw categoryError;
  if (courseError) throw courseError;

  return (categories ?? []).map((category) => ({
    ...(category as Category),
    courseCount: (courses ?? []).filter((c) => c.category_id === category.id).length,
  }));
}

export async function getCategoryById(id: string): Promise<Category | null> {
  const { data, error } = await supabaseAdmin.from("categories").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Category | null;
}

export async function findCategoryByName(name: string): Promise<Category | null> {
  const { data, error } = await supabaseAdmin.from("categories").select("*").eq("name", name).maybeSingle();
  if (error) throw error;
  return data as Category | null;
}

export async function createCategory(name: string): Promise<Category> {
  const { data, error } = await supabaseAdmin.from("categories").insert({ name }).select("*").single();
  if (error) throw error;
  return data as Category;
}

export async function updateCategory(id: string, name: string): Promise<Category | null> {
  const { data, error } = await supabaseAdmin.from("categories").update({ name }).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data as Category | null;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("categories").delete().eq("id", id);
  if (error) throw error;
}

export async function countCoursesForCategory(id: string): Promise<number> {
  const { count, error } = await supabaseAdmin.from("courses").select("*", { count: "exact", head: true }).eq("category_id", id);
  if (error) throw error;
  return count ?? 0;
}
