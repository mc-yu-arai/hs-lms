import { supabaseAdmin } from "../lib/supabase";

export type QuestionType = "single_choice" | "multiple_choice";

export interface Quiz {
  id: string;
  course_id: string;
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

export async function getQuizByCourseId(courseId: string): Promise<Quiz | null> {
  const { data, error } = await supabaseAdmin.from("quizzes").select("*").eq("course_id", courseId).maybeSingle();
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

// コース作成時のreplaceCurriculumと同様、questionsを全置換する(既存のquiz_attempts/quiz_answersは
// questions/choicesのON DELETE CASCADEで一緒に消える点に注意。既存受験履歴を残したまま設問だけ
// 差し替えたい場合は将来的に個別更新APIが必要)
export async function createOrReplaceQuiz(courseId: string, input: QuizInput): Promise<Quiz> {
  const existing = await getQuizByCourseId(courseId);

  const quizRow = { course_id: courseId, title: input.title, description: input.description ?? null };
  const { data: quiz, error: quizError } = existing
    ? await supabaseAdmin.from("quizzes").update(quizRow).eq("id", existing.id).select("*").single()
    : await supabaseAdmin.from("quizzes").insert(quizRow).select("*").single();
  if (quizError) throw quizError;

  const { error: deleteError } = await supabaseAdmin.from("questions").delete().eq("quiz_id", quiz.id);
  if (deleteError) throw deleteError;

  for (let i = 0; i < input.questions.length; i++) {
    const question = input.questions[i];
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
