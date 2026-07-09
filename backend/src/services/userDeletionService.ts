import { supabaseAdmin } from "../lib/supabase";
import { deleteAvatar } from "./avatarStorage";

// 完全削除: 依存先(修了証・通知履歴・受講登録)を先に削除してからpublic.users→auth.usersの順で削除する。
// enrollments/certificates/notification_logsのuser_idにはON DELETE CASCADEが無いため、
// public.usersを削除する前にこれらを明示的に削除しておく必要がある(削除順を誤るとFK違反になる)。
// lesson_progress/quiz_attempts/quiz_answersはenrollmentsへのON DELETE CASCADEで、
// group_membersはusersへのON DELETE CASCADEで、それぞれ連鎖削除される。
export async function deleteUserCompletely(userId: string): Promise<void> {
  const { error: certError } = await supabaseAdmin.from("certificates").delete().eq("user_id", userId);
  if (certError) throw certError;

  const { error: notifError } = await supabaseAdmin.from("notification_logs").delete().eq("user_id", userId);
  if (notifError) throw notifError;

  const { error: enrollError } = await supabaseAdmin.from("enrollments").delete().eq("user_id", userId);
  if (enrollError) throw enrollError;

  const { error: userError } = await supabaseAdmin.from("users").delete().eq("id", userId);
  if (userError) throw userError;

  try {
    await deleteAvatar(userId);
  } catch (err) {
    console.error("アバター画像の削除に失敗しました:", err);
  }

  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authError) throw authError;
}
