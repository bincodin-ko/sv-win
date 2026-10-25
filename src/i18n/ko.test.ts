// S-2408 사전 점검 + S-2409 공용 낱말. 소스의 t("…")·tp("…","…",…)·tm("…") 큰따옴표/작은따옴표 리터럴만 대상.
// 규칙: 템플릿 문자열(`…`) 키·이어붙인 키는 쓰지 않는다(검사 못 함). 키 안의 \" \n 이스케이프도 쓰지 않는다.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ko from "./ko";
import common from "./ko/common";
import settings from "./ko/settings";

const DICTS = import.meta.glob("./ko/*.ts", { eager: true, import: "default" }) as Record<string, Record<string, string>>;
const FILES = Object.entries(DICTS).filter(([p]) => !p.endsWith("/index.ts"));

const root = join(process.cwd(), "src");
const walk = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = join(d, e.name);
    if (e.isDirectory()) return e.name === "i18n" ? [] : walk(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
const STR = String.raw`("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')`;
const CALL = new RegExp(String.raw`(?<![\w.$])(?:t|tm)\(\s*${STR}|(?<![\w.$])tp\(\s*${STR}\s*,\s*${STR}`, "g");
const unq = (s: string) => s.slice(1, -1).replace(/\\(["'\\])/g, "$1").replace(/\\n/g, "\n");
const keyOf = (m: RegExpMatchArray) => unq((m[3] ?? m[1] ?? m[2])!); // tp 는 뒤 문장(other)이 사전 키
const used = (): Map<string, string> => {
  const keys = new Map<string, string>(); // 키 → 처음 쓴 파일
  for (const f of walk(root)) for (const m of readFileSync(f, "utf8").matchAll(CALL)) keys.set(keyOf(m), f.slice(root.length + 1));
  return keys;
};
const vars = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1]))].sort().join(",");

describe("S-2408 사전", () => {
  it("사전 파일 9개가 있다", () => {
    expect(FILES.map(([p]) => p.slice(5, -3)).sort()).toEqual(["board", "cards", "commands", "common", "console", "features", "settings", "shell", "studio"]);
  });
  it("① 소스의 t/tp/tm 글이 모두 ko 사전에 있다", () => {
    const missing = [...used()].filter(([k]) => !(k in ko)).map(([k, f]) => `${f}: ${k}`);
    expect(missing, `사전에 없는 글 ${missing.length}개\n${missing.join("\n")}`).toEqual([]);
  });
  it("② 두 파일의 같은 키는 값이 같다", () => {
    const seen = new Map<string, [string, string]>();
    const bad: string[] = [];
    for (const [p, d] of FILES) for (const [k, v] of Object.entries(d)) {
      const o = seen.get(k);
      if (o && o[1] !== v) bad.push(`${k}: ${o[0]}="${o[1]}" / ${p}="${v}"`);
      else seen.set(k, [p, v]);
    }
    expect(bad).toEqual([]);
  });
  it("③ 값이 비어 있지 않다", () => {
    expect(Object.entries(ko).filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
  });
  it("④ 자리표시자 {x} 집합이 키와 값에서 같다", () => {
    expect(Object.entries(ko).filter(([k, v]) => vars(k) !== vars(v)).map(([k]) => k)).toEqual([]);
  });
  it("⑤ 소스에 안 쓰이는 키는 경고만", () => {
    const u = used();
    const unused = Object.keys(ko).filter((k) => !u.has(k));
    if (unused.length) console.warn(`안 쓰이는 사전 키 ${unused.length}개`, unused.slice(0, 20));
    expect(true).toBe(true);
  });
  it("정규식이 따옴표 두 종류와 tp 의 뒤 문장을 읽고 foo.t( 는 무시", () => {
    const s = `t("A b") t('C d') tm("E") tp("{n} x", "{n} xs", n) foo.t("no") rt("no")`;
    expect([...s.matchAll(CALL)].map(keyOf)).toEqual(["A b", "C d", "E", "{n} xs"]);
  });
});

describe("S-2409 공용 낱말 / S-2411 설정 창 사전", () => {
  const WORDS: Record<string, string> = { Cancel: "취소", Close: "닫기", Delete: "삭제", Save: "저장", Settings: "설정", Restart: "다시 시작" };
  it("common 에 공용 낱말이 있고 용어 표(§0)와 같다", () => {
    for (const w of ["OK", "Back", "Next", "Done", "Open", "Add", "Remove", "Rename", "Copy", "Paste", "Undo", "Redo", "Retry", "Yes", "No", "Loading…", "Error"]) expect(common[w], w).toBeTruthy();
    for (const [k, v] of Object.entries(WORDS)) expect(common[k], k).toBe(v);
  });
  it("settings 사전에 창 이름과 Language 줄 글이 있고 언어 이름은 번역 안 함", () => {
    for (const k of ["Account", "General", "Appearance", "Shortcuts", "Agents", "Connections", "Voice", "About", "Language"]) expect(settings[k], k).toBeTruthy();
    expect(settings["English"]).toBeUndefined();
    expect(settings["한국어"]).toBeUndefined();
  });
});
