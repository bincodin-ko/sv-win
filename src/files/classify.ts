// S-953: 놓은 것의 종류 판정 (순수). 순서: ① 폴더 ② 이미지 확장자 ③ repo 안 .md ④ 그 밖의 텍스트 ⑤ 나머지
import type { FileStat } from "../lib/ipc";

export type DropKind = "explorer" | "image" | "markdown" | "code" | "file";
/** 파일 앞부분을 본 결과(Rust file_text 의 판정: 앞 8KB 에 NUL 없고 UTF-8, 800KB 이하) */
export type Head = "text" | "binary" | "tooLarge" | "error";
export const TEXT_MAX = 800 * 1024;
const IMAGE = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);

export function classify(stat: FileStat, head: Head, ext: string, inRepo: boolean, dirHasText = false): DropKind {
  if (!stat.exists) return "file";
  if (stat.isDir) return dirHasText ? "explorer" : "file";
  const e = ext.toLowerCase();
  if (IMAGE.has(e)) return "image";
  if (inRepo && (e === "md" || e === "markdown")) return "markdown";
  return head === "text" && stat.size <= TEXT_MAX ? "code" : "file";
}
