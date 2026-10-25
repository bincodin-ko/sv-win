// 5묶음 E4: Code 스튜디오 순수 상태(열기→편집→저장 전이·트리 정렬·이름 검사·헤더 문구). 화면(CodeStudio)과 ipc 는 이 파일을 모른다.
import { t } from "../../i18n";
import { HIGHLIGHT_MAX } from "../../files/highlight";
import type { StudioEntry } from "../../lib/ipc";
import { encodeCp1252 } from "../encoding";

export interface Doc {
  path: string; realPath: string; outside: boolean; text: string;
  encoding: string; bom: boolean; crlf: boolean; mtimeMs: number; bytes: number;
}
export type Banner = { kind: "recovered" | "changed" | "cantEncode" } | null;
export interface State { doc: Doc | null; text: string; banner: Banner; forced: boolean; flash: boolean; readOnly: boolean }
export type Action =
  | { t: "open"; doc: Doc; draft?: { text: string; baseMtime: number } }
  | { t: "edit"; text: string }
  | { t: "saved"; mtimeMs: number }
  | { t: "changed" }
  | { t: "keepMine" }
  | { t: "cantEncode" }
  | { t: "convert" }
  | { t: "discardDraft" }
  | { t: "readOnly" }
  | { t: "flashOff" }
  | { t: "close" };

export const initial: State = { doc: null, text: "", banner: null, forced: false, flash: false, readOnly: false };

export function reduce(s: State, a: Action): State {
  switch (a.t) {
    case "open": {
      const rec = !!a.draft && a.draft.text !== a.doc.text;
      return { ...initial, doc: a.doc, text: rec ? a.draft!.text : a.doc.text, banner: rec ? { kind: "recovered" } : null };
    }
    case "edit": return { ...s, text: a.text };
    case "saved": return s.doc ? { ...s, doc: { ...s.doc, text: s.text, mtimeMs: a.mtimeMs }, banner: null, forced: false, flash: true } : s;
    case "changed": return { ...s, banner: { kind: "changed" } };
    case "keepMine": return { ...s, banner: null, forced: true };
    case "cantEncode": return { ...s, banner: { kind: "cantEncode" } };
    case "convert": return s.doc ? { ...s, doc: { ...s.doc, encoding: "utf-8" }, banner: null } : s;
    case "discardDraft": return s.doc ? { ...s, text: s.doc.text, banner: null } : s;
    case "readOnly": return { ...s, readOnly: true };
    case "flashOff": return { ...s, flash: false };
    case "close": return initial;
  }
}
export const isDirty = (s: State): boolean => !!s.doc && s.text !== s.doc.text;
export const canSave = (s: State): boolean => isDirty(s) && !s.readOnly;
/** Windows-1252 파일에 표에 없는 글자가 들어 있나 */
export const needsConvert = (encoding: string, text: string): boolean => encoding === "windows-1252" && encodeCp1252(text) === null;

const lc = (s: string) => s.toLowerCase();
export const sortEntries = (e: StudioEntry[]): StudioEntry[] =>
  [...e].sort((a, b) => Number(b.isDir) - Number(a.isDir) || lc(a.name).localeCompare(lc(b.name)));
/** README 먼저, 없으면 트리 첫 파일, 파일이 없으면 null */
export const pickFirst = (e: StudioEntry[]): StudioEntry | null => {
  const files = e.filter((x) => !x.isDir);
  return files.find((x) => /^readme(\.|$)/i.test(x.name)) ?? files[0] ?? null;
};
/** 못 쓰는 이름이면 이유 문구, 괜찮으면 null */
export function nameError(name: string, siblings: string[]): string | null {
  if (!name.trim()) return t("Enter a name.");
  if (/[<>:"/\\|?*]/.test(name)) return `${t("A name can't contain")} < > : \" / \\ | ? *`;
  if (/[. ]$/.test(name)) return t("A name can't end with a dot or a space.");
  if (siblings.some((x) => lc(x) === lc(name))) return t('"{name}" already exists.', { name });
  return null;
}
export const encLabel = (encoding: string, bom: boolean): string =>
  encoding === "windows-1252" ? "Windows-1252" : encoding === "utf-16le" ? "UTF-16 LE" : encoding === "utf-16be" ? "UTF-16 BE" : bom ? "UTF-8 with BOM" : "";
/** 편집기 위 줄 조각: 경로·언어·"N lines"·"x.x KB"·(UTF-8·LF 가 아닌 것) */
export const headParts = (d: Doc, text: string, lang: string): string[] =>
  [d.path, lang, t("{n} lines", { n: text.split("\n").length }), `${(d.bytes / 1024).toFixed(1)} KB`, encLabel(d.encoding, d.bom), d.crlf ? "CRLF" : ""].filter((x, i) => i < 4 || x);
export const shouldHighlight = (len: number): boolean => len <= HIGHLIGHT_MAX;

const norm = (p: string) => lc(p.replace(/\\/g, "/").replace(/\/+$/, ""));
const parent = (p: string) => p.replace(/\\/g, "/").replace(/\/[^/]*$/, "");
/** 휴지통으로 보낸 경로가 열린 파일을 닫아야 하나 */
export const closesOpen = (open: string | null, trashed: string): boolean => !!open && (norm(open) === norm(trashed) || norm(open).startsWith(norm(trashed) + "/"));
/** + 메뉴가 만드는 위치 */
export const newItemDir = (root: string, sel: { path: string; isDir: boolean } | null): string => (!sel ? root : sel.isDir ? sel.path : parent(sel.path));
/** Add folder 의 폴더: 선택한 폴더, 없으면 열린 파일의 폴더, 없으면 root */
export const addFolderDir = (root: string, selDir: string | null, openPath: string | null): string => selDir ?? (openPath ? parent(openPath) : root);
/** repo 밖 위치 허용 답(앱 끌 때까지만, 메모리 맵) */
const outside = new Map<string, "allow" | "readonly">();
export const outsideMemory = {
  get: (real: string) => outside.get(norm(real)),
  set: (real: string, a: "allow" | "readonly"): void => void outside.set(norm(real), a),
  clear: (): void => outside.clear(),
};
