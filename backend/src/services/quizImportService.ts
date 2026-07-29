import { supabaseAdmin } from "../lib/supabase";
import { parseCsv } from "../lib/csv";
import {
  ensureQuizForCourse,
  getNextDisplayOrder,
  getQuestionsWithChoices,
  insertQuestionsIntoQuiz,
  type Quiz,
  type QuestionInput,
  type QuestionWithChoices,
} from "./quizRepository";

export type ImportMode = "append" | "replace";

export const DEFAULT_QUIZ_TITLE = "修了確認テスト";

export interface CsvRowError {
  row: number;
  message: string;
}

const REQUIRED_HEADERS = ["問題文", "問題種別", "選択肢1", "選択肢2", "選択肢3", "選択肢4", "正解"];
const CHOICE_COLUMN_COUNT = 4;

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildQuizCsvTemplate(): string {
  const example1 = [
    "接客時に最も重要な要素はどれですか",
    "single",
    "笑顔で対応する",
    "スマートフォンを見ながら対応する",
    "私語を優先する",
    "無視する",
    "1",
  ];
  const example2 = [
    "次のうち、望ましい接客態度をすべて選んでください",
    "multiple",
    "時間を守る",
    "身だしなみを整える",
    "私語を慎む",
    "",
    "1,2,3",
  ];
  const toLine = (fields: string[]) => fields.map(csvField).join(",");
  return "﻿" + [toLine(REQUIRED_HEADERS), toLine(example1), toLine(example2)].join("\r\n");
}

interface ParsedQuestionRow {
  rowNum: number;
  data: QuestionInput;
}

// CSV列: 問題文,問題種別(single/multiple),選択肢1〜4,正解(single=1つの数字/multiple=カンマ区切りの数字)。
// 選択肢は1列目から詰めて入力する前提(選択肢3が空欄なら選択肢4も空欄であること)で2〜4択に対応する。
export function parseAndValidateQuizRows(csvText: string): { rows: ParsedQuestionRow[]; errors: CsvRowError[] } {
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
  const rows: ParsedQuestionRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const rowNum = i + 1;
    const raw = dataRows[i];
    const questionText = (raw[colIndex("問題文")] ?? "").trim();
    const questionTypeRaw = (raw[colIndex("問題種別")] ?? "").trim();
    const correctRaw = (raw[colIndex("正解")] ?? "").trim();
    const choiceTexts = Array.from({ length: CHOICE_COLUMN_COUNT }, (_, idx) => (raw[colIndex(`選択肢${idx + 1}`)] ?? "").trim());

    const rowErrorCountBefore = errors.length;

    if (!questionText) errors.push({ row: rowNum, message: "問題文が未入力です" });

    if (questionTypeRaw !== "single" && questionTypeRaw !== "multiple") {
      errors.push({ row: rowNum, message: `問題種別の値が不正です（single/multipleのいずれか）: ${questionTypeRaw}` });
    }

    let choiceCount = CHOICE_COLUMN_COUNT;
    for (let c = 0; c < CHOICE_COLUMN_COUNT; c++) {
      if (!choiceTexts[c]) {
        choiceCount = c;
        break;
      }
    }
    const hasGap = choiceTexts.slice(choiceCount).some((t) => t.length > 0);
    if (hasGap) {
      errors.push({ row: rowNum, message: "選択肢は1から順に詰めて入力してください（空欄を挟めません）" });
    } else if (choiceCount < 2) {
      errors.push({ row: rowNum, message: "選択肢は2つ以上入力してください" });
    }

    let correctNumbers: number[] = [];
    if (!correctRaw) {
      errors.push({ row: rowNum, message: "正解が未入力です" });
    } else {
      const parts = correctRaw.split(",").map((p) => p.trim());
      if (parts.some((p) => !/^\d+$/.test(p))) {
        errors.push({ row: rowNum, message: `正解の指定が不正です: ${correctRaw}` });
      } else {
        correctNumbers = parts.map((p) => Number(p));
        const hasDuplicate = new Set(correctNumbers).size !== correctNumbers.length;
        const outOfRange = correctNumbers.some((n) => n < 1 || n > choiceCount);
        if (outOfRange) {
          errors.push({ row: rowNum, message: `正解が選択肢の範囲外です（1〜${choiceCount}）: ${correctRaw}` });
        } else if (hasDuplicate) {
          errors.push({ row: rowNum, message: `正解が重複しています: ${correctRaw}` });
        } else if (questionTypeRaw === "single" && correctNumbers.length !== 1) {
          errors.push({ row: rowNum, message: "単一選択（single）の正解は1つだけ指定してください" });
        } else if (questionTypeRaw === "multiple" && correctNumbers.length < 1) {
          errors.push({ row: rowNum, message: "複数選択（multiple）の正解を1つ以上指定してください" });
        }
      }
    }

    if (errors.length > rowErrorCountBefore) continue;

    rows.push({
      rowNum,
      data: {
        questionText,
        questionType: questionTypeRaw === "single" ? "single_choice" : "multiple_choice",
        choices: choiceTexts.slice(0, choiceCount).map((choiceText, idx) => ({
          choiceText,
          isCorrect: correctNumbers.includes(idx + 1),
        })),
      },
    });
  }

  if (errors.length > 0) {
    return { rows: [], errors: errors.sort((a, b) => a.row - b.row) };
  }

  return { rows, errors: [] };
}

export class QuizCsvValidationError extends Error {
  rowErrors: CsvRowError[];

  constructor(rowErrors: CsvRowError[]) {
    super("CSVの内容にエラーがあります");
    this.rowErrors = rowErrors;
  }
}

export interface QuizImportResult {
  quiz: Quiz;
  questions: QuestionWithChoices[];
  importedCount: number;
}

// 「1件でもエラーがあれば全件ロールバック」のため、事前に全件バリデーションを完了させてから書き込みを行う。
// replaceモードは「新しい設問の挿入が全件成功してから古い設問を削除する」順序にすることで、挿入途中の
// 失敗時に既存データを失わずに済む設計にしている（userImportService.tsの疑似ロールバックと同じ考え方）。
export async function importQuizQuestionsFromCsv(courseId: string, csvText: string, mode: ImportMode): Promise<QuizImportResult> {
  const { rows, errors } = parseAndValidateQuizRows(csvText);
  if (errors.length > 0) {
    throw new QuizCsvValidationError(errors);
  }

  const quiz = await ensureQuizForCourse(courseId, DEFAULT_QUIZ_TITLE);

  const previousQuestions = mode === "replace" ? await getQuestionsWithChoices(quiz.id) : [];
  const startOrder = mode === "append" ? await getNextDisplayOrder(quiz.id) : 0;

  await insertQuestionsIntoQuiz(
    quiz.id,
    rows.map((r) => r.data),
    startOrder,
  );

  if (mode === "replace" && previousQuestions.length > 0) {
    const { error } = await supabaseAdmin
      .from("questions")
      .delete()
      .in("id", previousQuestions.map((q) => q.id));
    if (error) throw error;
  }

  const questions = await getQuestionsWithChoices(quiz.id);
  return { quiz, questions, importedCount: rows.length };
}
