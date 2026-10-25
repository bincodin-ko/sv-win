// S-1852: 같은 HTML 을 임시 PDF 로 만들어 blob URL 로 돌려준다(쪽 미리보기 iframe src). 같은 HTML 은 캐시. Edge 가 없으면 null.
import { fileRead, pdfExport, pdfTempDir } from "../lib/ipc";
import { paperOf, type ExportOpts } from "./exportPdf";
import { buildPdfHtml } from "./html";

const cache = new Map<string, string>(); // ponytail: 앱이 사는 동안 계속 쌓임 — 문서를 많이 바꿔 보면 상한(LRU)을 둔다. 임시 PDF 파일은 Temp 폴더에 남는다
const hash = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16);
};

export async function previewPdf(o: Omit<ExportOpts, "toast">): Promise<string | null> {
  const paper = paperOf(o.paper);
  const html = buildPdfHtml({ ...o, paper });
  const key = hash(paper + html) + html.length.toString(16);
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const path = `${await pdfTempDir()}/preview-${key}.pdf`;
    await pdfExport(html, path, paper);
    const url = URL.createObjectURL(new Blob([await fileRead(path) as BlobPart], { type: "application/pdf" }));
    cache.set(key, url);
    return url;
  } catch (e) {
    if (String(e).startsWith("Microsoft Edge was not found")) return null;
    throw e;
  }
}
