import { supabaseAdmin } from "../lib/supabase";

export type QuestionType = "single_choice" | "multiple_choice";
export type QuizType = "course" | "chapter";

export interface Quiz {
  id: string;
  course_id: string;
  chapter_id: string | null;
  quiz_type: QuizType;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Question {
  id: string;
  quiz_id: string;
  question_text: string;
  question_type: QuestionType;
  display_order: number;
}

export interface Choice {
  id: string;
  question_id: string;
  choice_text: string;
  is_correct: boolean;
  display_order: number;
}

export interface QuestionWithChoices extends Question {
  choices: Choice[];
}

export interface QuizAttempt {
  id: string;
  enrollment_id: string;
  quiz_id: string;
  score: number;
  is_passed: boolean;
  submitted_at: string;
}

// コースの「コース修了テスト」(quiz_type='course')を取得する。章テストはchapter_idで別途取得する
export async function getQuizByCourseId(courseId: string): Promise<Quiz | null> {
  const { data, error } = await supabaseAdmin
    .from("quizzes")
    .select("*")
    .eq("course_id", courseId)
    .eq("quiz_type", "course")
    .maybeSingle();
  if (error) throw error;
  return data as Quiz | null;
}

export async function getQuizByChapterId(chapterId: string): Promise<Quiz | null> {
  const { data, error } = await supabaseAdmin
    .from("quizzes")
    .select("*")
    .eq("chapter_id", chapterId)
    .eq("quiz_type", "chapter")
    .maybeSingle();
  if (error) throw error;
  return data as Quiz | null;
}

export async function getQuestionsWithChoices(quizId: string): Promise<QuestionWithChoices[]> {
  const { data: questions, error: questionError } = await supabaseAdmin
    .from("questions")
    .select("*")
    .eq("quiz_id", quizId)
    .order("display_order", { ascending: true });
  if (questionError) throw questionError;

  const { data: choices, error: choiceError } = await supabaseAdmin
    .from("choices")
    .select("*")
    .in("question_id", (questions ?? []).map((q) => q.id))
    .order("display_order", { ascending: true });
  if (choiceError) throw choiceError;

  return (questions ?? []).map((question) => ({
    ...(question as Question),
    choices: (choices ?? []).filter((c) => c.question_id === question.id) as Choice[],
  }));
}

export interface ChoiceInput {
  choiceText: string;
  isCorrect: boolean;
}

export interface QuestionInput {
  questionText: string;
  questionType: QuestionType;
  choices: ChoiceInput[];
}

export interface QuizInput {
  title: string;
  description?: string | null;
  questions: QuestionInput[];
}

// questionsを全置換する(既存のquiz_attempts/quiz_answersはquestions/choicesのON DELETE CASCADEで
// 一緒に消える点に注意。既存受験履歴を残したまま設問だけ差し替えたい場合は将来的に個別更新APIが必要)。
// コース修了テスト・章テストの両方から呼ばれる共通実装(existingQuizとquizRowの組み立てだけが呼び出し元で異なる)。
async function createOrReplaceQuizRow(
  existing: Quiz | null,
  quizRow: { course_id: string; chapter_id: string | null; quiz_type: QuizType; title: string; description: string | null },
  questions: QuestionInput[],
): Promise<Quiz> {
  const { data: quiz, error: quizError } = existing
    ? await supabaseAdmin.from("quizzes").update(quizRow).eq("id", existing.id).select("*").single()
    : await supabaseAdmin.from("quizzes").insert(quizRow).select("*").single();
  if (quizError) throw quizError;

  const { error: deleteError } = await supabaseAdmin.from("questions").delete().eq("quiz_id", quiz.id);
  if (deleteError) throw deleteError;

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    const { data: questionRow, error: questionError } = await supabaseAdmin
      .from("questions")
      .insert({
        quiz_id: quiz.id,
        question_text: question.questionText,
        question_type: question.questionType,
        display_order: i,
      })
      .select("*")
      .single();
    if (questionError) throw questionError;

    const choiceRows = question.choices.map((choice, j) => ({
      question_id: questionRow.id,
      choice_text: choice.choiceText,
      is_correct: choice.isCorrect,
      display_order: j,
    }));
    const { error: choiceError } = await supabaseAdmin.from("choices").insert(choiceRows);
    if (choiceError) throw choiceError;
  }

  return quiz as Quiz;
}

export async function createOrReplaceCourseQuiz(courseId: string, input: QuizInput): Promise<Quiz> {
  const existing = await getQuizByCourseId(courseId);
  return createOrReplaceQuizRow(
    existing,
    { course_id: courseId, chapter_id: null, quiz_type: "course", title: input.title, description: input.description ?? null },
    input.questions,
  );
}

export async function createOrReplaceChapterQuiz(courseId: string, chapterId: string, input: QuizInput): Promise<Quiz> {
  const existing = await getQuizByChapterId(chapterId);
  return createOrReplaceQuizRow(
    existing,
    { course_id: courseId, chapter_id: chapterId, quiz_type: "chapter", title: input.title, description: input.description ?? null },
    input.questions,
  );
}

export interface QuizAnswerInput {
  questionId: string;
  choiceIds: string[];
}

export interface QuestionResult {
  questionId: string;
  isCorrect: boolean;
  correctChoiceIds: string[];
  selectedChoiceIds: string[];
}

function sameChoiceSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((id, i) => id === sortedB[i]);
}

export async function submitQuizAttempt(
  enrollmentId: string,
  quiz: Quiz,
  answers: QuizAnswerInput[],
  passScore: number,
): Promise<{ attempt: QuizAttempt; questionResults: QuestionResult[] }> {
  const questions = await getQuestionsWithChoices(quiz.id);
  const answersByQuestion = new Map(answers.map((a) => [a.questionId, a.choiceIds]));

  const questionResults: QuestionResult[] = questions.map((question) => {
    const correctChoiceIds = question.choices.filter((c) => c.is_correct).map((c) => c.id);
    const selectedChoiceIds = answersByQuestion.get(question.id) ?? [];
    return {
      questionId: question.id,
      isCorrect: sameChoiceSet(correctChoiceIds, selectedChoiceIds),
      correctChoiceIds,
      selectedChoiceIds,
    };
  });

  const correctCount = questionResults.filter((r) => r.isCorrect).length;
  const score = questions.length > 0 ? Math.round((correctCount / questions.length) * 10000) / 100 : 0;
  const isPassed = score >= passScore;

  const { data: attempt, error } = await supabaseAdmin
    .from("quiz_attempts")
    .insert({ enrollment_id: enrollmentId, quiz_id: quiz.id, score, is_passed: isPassed })
    .select("*")
    .single();
  if (error) throw error;

  const answerRows = answers.flatMap((a) =>
    a.choiceIds.map((choiceId) => ({ attempt_id: attempt.id, question_id: a.questionId, choice_id: choiceId })),
  );
  if (answerRows.length > 0) {
    const { error: answerError } = await supabaseAdmin.from("quiz_answers").insert(answerRows);
    if (answerError) throw answerError;
  }

  return { attempt: attempt as QuizAttempt, questionResults };
}

export async function listAttemptsForEnrollment(enrollmentId: string, quizId: string): Promise<QuizAttempt[]> {
  const { data, error } = await supabaseAdmin
    .from("quiz_attempts")
    .select("*")
    .eq("enrollment_id", enrollmentId)
    .eq("quiz_id", quizId)
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as QuizAttempt[];
}

export async function hasPassedQuiz(enrollmentId: string, quizId: string): Promise<boolean> {
  const attempts = await listAttemptsForEnrollment(enrollmentId, quizId);
  return attempts.some((a) => a.is_passed);
}

// CSVインポート用。対象コースにテストがまだ無い場合は仮タイトルで新規作成する
export async function ensureQuizForCourse(courseId: string, defaultTitle: string): Promise<Quiz> {
  const existing = await getQuizByCourseId(courseId);
  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from("quizzes")
    .insert({ course_id: courseId, chapter_id: null, quiz_type: "course", title: defaultTitle, description: null })
    .select("*")
    .single();
  if (error) throw error;
  return data as Quiz;
}

export async function getNextDisplayOrder(quizId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("questions")
    .select("display_order")
    .eq("quiz_id", quizId)
    .order("display_order", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data && data.length > 0 ? data[0].display_order + 1 : 0;
}

// CSVインポート用。既存の設問には触れず、新しい設問だけをdisplay_order = startOrder以降で追加する。
// 挿入途中で失敗した場合は、このインポートで挿入済みの分だけを削除して巻き戻す(既存データには影響しない)。
// 「置換」モードの場合、呼び出し元(quizImportService)が「新規追加が全件成功した後に古い設問を削除する」
// 順序で呼ぶことで、挿入失敗時に既存データを失わずに済む設計にしている。
export async function insertQuestionsIntoQuiz(
  quizId: string,
  questions: QuestionInput[],
  startOrder: number,
): Promise<void> {
  const insertedQuestionIds: string[] = [];
  try {
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      const { data: questionRow, error: questionError } = await supabaseAdmin
        .from("questions")
        .insert({
          quiz_id: quizId,
          question_text: question.questionText,
          question_type: question.questionType,
          display_order: startOrder + i,
        })
        .select("*")
        .single();
      if (questionError) throw questionError;
      insertedQuestionIds.push(questionRow.id);

      const choiceRows = question.choices.map((choice, j) => ({
        question_id: questionRow.id,
        choice_text: choice.choiceText,
        is_correct: choice.isCorrect,
        display_order: j,
      }));
      const { error: choiceError } = await supabaseAdmin.from("choices").insert(choiceRows);
      if (choiceError) throw choiceError;
    }
  } catch (err) {
    for (const id of insertedQuestionIds) {
      await supabaseAdmin.from("questions").delete().eq("id", id);
    }
    throw err;
  }
}
