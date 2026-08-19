-- 0010: 章テストの合格点を個別設定できるようにする
-- quizzesにpass_scoreを追加。コース修了テスト(quiz_type='course')は引き続きcourses.pass_scoreで
-- 採点するため、このカラムはコース修了テストでは未使用のまま残る(デフォルト70のまま放置してよい)。
-- 章テスト(quiz_type='chapter')のみ、この値で合否判定するよう backend/src/routes/courses.ts を変更する。
-- pass_score=0の場合、submitQuizAttemptの判定式(score >= passScore)がscoreの値に関わらず常にtrueになるため、
-- 「結果にかかわらず全員合格」という運用は特別なコード分岐を追加せずこのカラムの値だけで実現できる。

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS pass_score INTEGER NOT NULL DEFAULT 70 CHECK (pass_score >= 0 AND pass_score <= 100);
