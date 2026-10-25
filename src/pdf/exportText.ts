// S-1853: Markdown 내보내기(저장 창, .md)와 클립보드 복사. 파일 쓰기는 Rust export_write.
import { exportWrite, pickSavePath } from "../lib/ipc";
import { safeName } from "./exportPdf";

/** 저장한 경로, 취소하면 null */
export async function exportMarkdown(title: string, md: string): Promise<string | null> {
  const out = await pickSavePath(`${safeName(title)}.md`, [{ name: "Markdown", extensions: ["md"] }]);
  if (!out) return null;
  await exportWrite(out, new TextEncoder().encode(md));
  return out;
}
export async function copyMarkdown(md: string): Promise<void> {
  await navigator.clipboard.writeText(md);
}
