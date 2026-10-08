/**
 * HS-LMS メール送信中継（Google Apps Script Webアプリ）
 *
 * バックエンド(Render)から HTTPS POST で呼ばれ、MailApp でメールを送信する。
 * Renderの無料プランはSMTPを遮断するため、この中継経由で送信する。
 *
 * 【設定】スクリプトプロパティに SHARED_SECRET を登録する
 *   （プロジェクトの設定 → スクリプト プロパティ。Render側の GAS_MAIL_SECRET と同じ値）
 * 【デプロイ】デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
 *   次のユーザーとして実行: 自分 / アクセスできるユーザー: 全員
 *   発行された「…/exec」のURLを Render の GAS_MAIL_URL に設定する。
 * コードを変更したら「デプロイを管理」から新しいバージョンで更新すること（URLは変わらない）。
 */
function doPost(e) {
  try {
    var secret = PropertiesService.getScriptProperties().getProperty("SHARED_SECRET");
    if (!secret) return respond_({ ok: false, error: "SHARED_SECRET is not configured" });

    var data = JSON.parse(e.postData.contents);
    if (!data.secret || data.secret !== secret) return respond_({ ok: false, error: "unauthorized" });

    if (!data.to || !data.subject || !data.html) {
      return respond_({ ok: false, error: "to / subject / html are required" });
    }
    // 宛先は1件のみ許可（カンマ区切りでの一斉送信を防ぐ）
    if (!/^[^\s,;<>]+@[^\s,;<>]+$/.test(data.to)) {
      return respond_({ ok: false, error: "invalid recipient" });
    }

    MailApp.sendEmail({
      to: data.to,
      subject: data.subject,
      htmlBody: data.html,
      body: "このメールはHTML形式です。HTML表示に対応したメールソフトでご覧ください。",
      name: "HS-LMS",
    });
    return respond_({ ok: true });
  } catch (err) {
    return respond_({ ok: false, error: String(err) });
  }
}

function respond_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** 初回のみエディタから手動実行し、メール送信の権限を承認するための関数 */
function authorize() {
  MailApp.getRemainingDailyQuota();
}
