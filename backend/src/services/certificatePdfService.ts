import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

// OFLライセンス(SIL Open Font License)のNoto Sans JPをバンドルしてpdfkitに埋め込む。
// puppeteerだとデプロイ先(Render)のNode標準buildpackにCJKフォントが入っておらず
// 別途OSレベルの対応が必要になるため、フォント同梱で完結するpdfkitを採用した。
const FONT_PATH = path.resolve(__dirname, "../../assets/fonts/NotoSansJP-Variable.ttf");

export interface CertificatePdfInput {
  learnerName: string;
  courseTitle: string;
  issuedAt: string;
  verifyUrl: string;
}

function formatDateJa(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export async function generateCertificatePdf(input: CertificatePdfInput): Promise<Buffer> {
  const qrDataUrl = await QRCode.toDataURL(input.verifyUrl, { margin: 1, width: 200 });
  const qrImageBuffer = Buffer.from(qrDataUrl.split(",")[1], "base64");

  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 60 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  doc.font(FONT_PATH);

  doc
    .rect(20, 20, doc.page.width - 40, doc.page.height - 40)
    .lineWidth(2)
    .strokeColor("#1d4ed8")
    .stroke();

  doc.fontSize(36).fillColor("#111827").text("修了証", 0, 90, { align: "center" });

  doc.moveDown(3);
  doc.fontSize(20).text(`${input.learnerName} 様`, { align: "center" });

  doc.moveDown(1.5);
  doc.fontSize(13).fillColor("#374151").text("あなたは下記のコースを修了したことをここに証します。", { align: "center" });

  doc.moveDown(1);
  doc.fontSize(22).fillColor("#111827").text(input.courseTitle, { align: "center" });

  doc.moveDown(2);
  doc.fontSize(12).fillColor("#374151").text(`発行日: ${formatDateJa(input.issuedAt)}`, { align: "center" });

  const qrSize = 90;
  doc.image(qrImageBuffer, doc.page.width - qrSize - 70, doc.page.height - qrSize - 60, { width: qrSize, height: qrSize });
  doc.fontSize(8).fillColor("#6b7280").text("QRコードから真正性を確認できます", doc.page.width - qrSize - 90, doc.page.height - 65, {
    width: qrSize + 40,
    align: "center",
  });

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
