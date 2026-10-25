// S-1851: 저장 창 → buildPdfHtml → pdf_export → 성공 토스트(열기 / 폴더에서 보기). 취소하면 아무것도 안 한다.
import { t } from "../i18n";
import { fsOpen, fsReveal, pdfExport, pickSavePath } from "../lib/ipc";
import { useSettings } from "../settings/useSettings";
import { buildPdfHtml, type Paper, type PdfOpts } from "./html";

export type SavedToast = { message: string; open: () => void; reveal: () => void };
export type ExportOpts = Omit<PdfOpts, "paper"> & { paper?: Paper; toast?: (t: SavedToast) => void };

export const safeName = (s: string) => s.replace(/[\\/:*?"<>|\r\n]+/g, "-").trim() || "document";
export const paperOf = (p?: Paper): Paper => p ?? (useSettings.getState().s.pdfPaper === "a4" ? "a4" : "letter");
const dirOf = (p: string) => p.replace(/[\\/][^\\/]*$/, "");

/** 저장한 경로, 취소하면 null. Edge 없음·실패는 문구(string)로 던진다 */
export async function exportPdf(o: ExportOpts): Promise<string | null> {
  const s = useSettings.getState();
  const dir = String(s.s.pdfDir ?? "");
  const out = await pickSavePath(`${dir ? dir + "/" : ""}${safeName(o.title)}.pdf`, [{ name: "PDF", extensions: ["pdf"] }]);
  if (!out) return null;
  await pdfExport(buildPdfHtml({ ...o, paper: paperOf(o.paper) }), out, paperOf(o.paper));
  s.patch({ pdfDir: dirOf(out) });
  o.toast?.({ message: t("Saved {name}", { name: out.split(/[\\/]/).pop() ?? "" }), open: () => void fsOpen(out), reveal: () => void fsReveal(out) });
  return out;
}
