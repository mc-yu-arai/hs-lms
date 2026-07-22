import { supabaseAdmin } from "../lib/supabase";
import { sendEmail } from "../lib/resend";
import { env } from "../config/env";
import { generateRandomPassword } from "../lib/password";
import { parseCsv } from "../lib/csv";
import { findUserByEmail, type AppUser } from "./userRepository";
import { findGroupByName } from "./groupRepository";
import { addGroupMemberAndSyncEnrollments } from "./groupService";

export type UserRole = "learner" | "admin" | "super_admin";
const VALID_ROLES: UserRole[] = ["learner", "admin", "super_admin"];

export interface NewUserInput {
  lastName: string;
  firstName: string;
  email: string;
  role: UserRole;
  department?: string | null;
  hireDate?: string | null;
}

function welcomeEmailHtml(email: string, password: string): string {
  return `<p>HS-LMSのアカウントが作成されました。</p>
<p>メールアドレス: ${email}</p>
<p>初期パスワード: ${password}</p>
<p>ログイン後、プロフィール画面から早めにパスワードを変更してください。</p>
<p><a href="${env.FRONTEND_URL}/login">ログイン画面はこちら</a></p>`;
}

// Supabase Authにアカウントを作成し、public.usersへ登録する。
// public.usersへの登録に失敗した場合はAuthアカウントを削除して単体ロールバックする。
async function provisionUser(input: NewUserInput): Promise<AppUser> {
  const password = env.DEFAULT_USER_PASSWORD ?? generateRandomPassword();

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password,
    email_confirm: true,
  });
  if (authError || !authData?.user) {
    throw new Error(`Supabase Authでのアカウント作成に失敗しました（${input.email}）: ${authError?.message ?? "unknown error"}`);
  }

  const { data: profileRow, error: profileError } = await supabaseAdmin
    .from("users")
    .insert({
      id: authData.user.id,
      email: input.email,
      last_name: input.lastName,
      first_name: input.firstName,
      role: input.role,
      department: input.department ?? null,
      hire_date: input.hireDate ?? null,
    })
    .select("*")
    .single();

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    throw profileError;
  }

  try {
    await sendEmail(input.email, "【HS-LMS】アカウントが作成されました", welcomeEmailHtml(input.email, password));
  } catch (sendError) {
    console.error("アカウント作成メールの送信に失敗しました:", sendError);
  }

  return profileRow as AppUser;
}

export async function createUserManually(input: NewUserInput & { groupIds?: string[] }): Promise<AppUser> {
  const user = await provisionUser(input);
  for (const groupId of input.groupIds ?? []) {
    await addGroupMemberAndSyncEnrollments(groupId, user.id);
  }
  return user;
}

export interface CsvRowError {
  row: number;
  message: string;
}

export interface CsvUserRow extends NewUserInput {
  groupNames: string[];
}

interface ParsedRow {
  rowNum: number;
  data: CsvUserRow;
}

const REQUIRED_HEADERS = ["姓", "名", "メールアドレス", "ロール", "部署", "入社日", "グループ"];

export function buildCsvTemplate(): string {
  const header = REQUIRED_HEADERS.join(",");
  const example = "山田,太郎,yamada@example.com,learner,営業部,2024-04-01,営業チーム;新人研修グループ";
  return "﻿" + [header, example].join("\r\n");
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function parseAndValidateRows(csvText: string): Promise<{ rows: ParsedRow[]; errors: CsvRowError[] }> {
  const table = parseCsv(csvText);
  if (table.length === 0) {
    return { rows: [], errors: [{ row: 0, message: "CSVにデータがありません" }] };
  }

  const header = table[0].map((h) => h.trim());
  const missingHeaders = REQUIRED_HEADERS.filter((h) => !header.includes(h));
  if (missingHeaders.length > 0) {
    return { rows: [], errors: [{ row: 0, message: `ヘッダー行に不足があります: ${missingHeaders.join(", ")}` }] };
  }

  const colIndex = (name: string) => header.indexOf(name);
  const dataRows = table.slice(1);

  const errors: CsvRowError[] = [];
  const candidates: ParsedRow[] = [];
  const seenEmails = new Set<string>();

  for (let i = 0; i < dataRows.length; i++) {
    const rowNum = i + 1;
    const raw = dataRows[i];
    const lastName = (raw[colIndex("姓")] ?? "").trim();
    const firstName = (raw[colIndex("名")] ?? "").trim();
    const email = (raw[colIndex("メールアドレス")] ?? "").trim();
    const role = (raw[colIndex("ロール")] ?? "").trim();
    const department = (raw[colIndex("部署")] ?? "").trim();
    const hireDateRaw = (raw[colIndex("入社日")] ?? "").trim();
    const groupField = (raw[colIndex("グループ")] ?? "").trim();

    const rowErrorCountBefore = errors.length;

    if (!lastName) errors.push({ row: rowNum, message: "姓が未入力です" });
    if (!firstName) errors.push({ row: rowNum, message: "名が未入力です" });

    if (!email || !EMAIL_REGEX.test(email)) {
      errors.push({ row: rowNum, message: `メールアドレスの形式が不正です: ${email}` });
    } else if (seenEmails.has(email.toLowerCase())) {
      errors.push({ row: rowNum, message: `CSV内でメールアドレスが重複しています: ${email}` });
    } else {
      seenEmails.add(email.toLowerCase());
    }

    if (!VALID_ROLES.includes(role as UserRole)) {
      errors.push({ row: rowNum, message: `ロールの値が不正です（learner/admin/super_adminのいずれか）: ${role}` });
    }

    let hireDate: string | null = null;
    if (hireDateRaw) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(hireDateRaw) || Number.isNaN(Date.parse(hireDateRaw))) {
        errors.push({ row: rowNum, message: `入社日の形式が不正です（YYYY-MM-DD）: ${hireDateRaw}` });
      } else {
        hireDate = hireDateRaw;
      }
    }

    const groupNames = groupField
      ? groupField
          .split(";")
          .map((g) => g.trim())
          .filter((g) => g.length > 0)
      : [];

    if (errors.length > rowErrorCountBefore) continue;

    candidates.push({
      rowNum,
      data: { lastName, firstName, email, role: role as UserRole, department: department || null, hireDate, groupNames },
    });
  }

  for (const candidate of candidates) {
    const existing = await findUserByEmail(candidate.data.email);
    if (existing) {
      errors.push({ row: candidate.rowNum, message: `既に登録されているメールアドレスです: ${candidate.data.email}` });
    }
  }

  const allGroupNames = [...new Set(candidates.flatMap((c) => c.data.groupNames))];
  const groupExists = new Map<string, boolean>();
  for (const name of allGroupNames) {
    groupExists.set(name, (await findGroupByName(name)) !== null);
  }
  for (const candidate of candidates) {
    for (const name of candidate.data.groupNames) {
      if (!groupExists.get(name)) {
        errors.push({ row: candidate.rowNum, message: `存在しないグループです: ${name}` });
      }
    }
  }

  if (errors.length > 0) {
    return { rows: [], errors: errors.sort((a, b) => a.row - b.row) };
  }

  return { rows: candidates, errors: [] };
}

export class CsvValidationError extends Error {
  rowErrors: CsvRowError[];

  constructor(rowErrors: CsvRowError[]) {
    super("CSVの内容にエラーがあります");
    this.rowErrors = rowErrors;
  }
}

export interface CsvImportResult {
  created: AppUser[];
}

// 「1件でもエラーがあれば全件ロールバック」のうち、Authアカウント+public.users作成フェーズは
// 全件事前バリデーション済みの行のみを対象に1件ずつ作成し、途中で失敗したら作成済み分を削除して巻き戻す。
// グループ割り当ては全ユーザー作成が成功した後の最終フェーズとして実行する（グループ名は事前検証済みのため、
// ここでの失敗は通常発生しない想定。詳細はdocs/handoff/PROJECT_STATUS.mdの既知の問題を参照）。
export async function importUsersFromCsv(csvText: string): Promise<CsvImportResult> {
  const { rows, errors } = await parseAndValidateRows(csvText);
  if (errors.length > 0) {
    throw new CsvValidationError(errors);
  }

  const created: AppUser[] = [];
  try {
    for (const row of rows) {
      const user = await provisionUser(row.data);
      created.push(user);
    }
  } catch (err) {
    for (const user of created) {
      await supabaseAdmin.from("users").delete().eq("id", user.id);
      await supabaseAdmin.auth.admin.deleteUser(user.id);
    }
    throw err;
  }

  for (let i = 0; i < rows.length; i++) {
    for (const groupName of rows[i].data.groupNames) {
      const group = await findGroupByName(groupName);
      if (group) {
        await addGroupMemberAndSyncEnrollments(group.id, created[i].id);
      }
    }
  }

  return { created };
}
