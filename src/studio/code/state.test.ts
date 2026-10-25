import { beforeEach, describe, expect, it } from "vitest";
import type { StudioEntry } from "../../lib/ipc";
import { HIGHLIGHT_MAX } from "../../files/highlight";
import { addFolderDir, canSave, closesOpen, encLabel, headParts, initial, isDirty, nameError, needsConvert, newItemDir, outsideMemory, pickFirst, reduce, shouldHighlight, sortEntries, type Doc, type State } from "./state";

const doc = (o: Partial<Doc> = {}): Doc => ({ path: "C:/r/a.ts", realPath: "C:/r/a.ts", outside: false, text: "one\ntwo", encoding: "utf-8", bom: false, crlf: false, mtimeMs: 10, bytes: 7, ...o });
const opened = (o: Partial<Doc> = {}): State => reduce(initial, { t: "open", doc: doc(o) });
const ent = (name: string, isDir = false): StudioEntry => ({ name, path: `C:/r/${name}`, isDir, size: 1 });

describe("S-1870·S-1871 트리 정렬·README 먼저", () => {
  it("폴더 먼저, 이름순(대소문자 무시)", () => {
    const r = sortEntries([ent("b.ts"), ent("Zed", true), ent("A.ts"), ent("alpha", true), ent("c.ts")]);
    expect(r.map((e) => e.name)).toEqual(["alpha", "Zed", "A.ts", "b.ts", "c.ts"]);
  });
  it("README.md, readme.MD 처럼 대소문자 무시로 README 를 먼저 연다", () => {
    expect(pickFirst(sortEntries([ent("a.ts"), ent("README.md")]))?.name).toBe("README.md");
    expect(pickFirst(sortEntries([ent("a.ts"), ent("readme.MD")]))?.name).toBe("readme.MD");
    expect(pickFirst(sortEntries([ent("docs", true), ent("a.ts"), ent("README.txt")]))?.name).toBe("README.txt");
  });
  it("README 가 없으면 트리 첫 파일(폴더는 건너뜀), 파일이 없으면 null", () => {
    expect(pickFirst(sortEntries([ent("src", true), ent("b.ts"), ent("a.ts")]))?.name).toBe("a.ts");
    expect(pickFirst([ent("src", true)])).toBeNull();
    expect(pickFirst([])).toBeNull();
  });
});

describe("S-1874 새 이름 검사", () => {
  it("빈 이름·Windows 금지 글자·겹침(대소문자 무시)은 거절, 괜찮으면 null", () => {
    expect(nameError("", [])).toBeTruthy();
    expect(nameError("   ", [])).toBeTruthy();
    for (const c of ["<", ">", ":", '"', "/", "\\", "|", "?", "*"]) expect(nameError(`a${c}b`, [])).toBeTruthy();
    expect(nameError("Main.ts", ["main.ts"])).toBeTruthy();
    expect(nameError("new.ts", ["main.ts"])).toBeNull();
    expect(nameError("a b.c.ts", [])).toBeNull();
  });
  it("만드는 위치: 선택 폴더 / 선택 파일의 폴더 / 없으면 root", () => {
    expect(newItemDir("C:/r", null)).toBe("C:/r");
    expect(newItemDir("C:/r", { path: "C:/r/src", isDir: true })).toBe("C:/r/src");
    expect(newItemDir("C:/r", { path: "C:/r/src/a.ts", isDir: false })).toBe("C:/r/src");
  });
  it("S-1888 Add folder 위치: 선택한 폴더 > 열린 파일의 폴더 > root", () => {
    expect(addFolderDir("C:/r", "C:/r/lib", "C:/r/src/a.ts")).toBe("C:/r/lib");
    expect(addFolderDir("C:/r", null, "C:/r/src/a.ts")).toBe("C:/r/src");
    expect(addFolderDir("C:/r", null, null)).toBe("C:/r");
  });
});

describe("S-1873 휴지통으로 보내면 열린 파일을 닫는다", () => {
  it("같은 파일이거나 그 폴더 안이면 닫고, 다른 파일이면 아니다", () => {
    expect(closesOpen("C:/r/a.ts", "C:/r/a.ts")).toBe(true);
    expect(closesOpen("C:/r/src/a.ts", "C:/r/src")).toBe(true);
    expect(closesOpen("C:/r/src2/a.ts", "C:/r/src")).toBe(false);
    expect(closesOpen(null, "C:/r/src")).toBe(false);
  });
});

describe("S-1875~S-1880 열기→편집→저장→Saved", () => {
  it("열면 글 = 디스크 글, 안 더럽다, Save 꺼짐", () => {
    const s = opened();
    expect(s.text).toBe("one\ntwo");
    expect(isDirty(s)).toBe(false);
    expect(canSave(s)).toBe(false);
  });
  it("고치면 더러워지고 Save 켜짐, 원래 글로 돌아가면 다시 깨끗", () => {
    let s = reduce(opened(), { t: "edit", text: "one\ntwo!" });
    expect(isDirty(s)).toBe(true);
    expect(canSave(s)).toBe(true);
    s = reduce(s, { t: "edit", text: "one\ntwo" });
    expect(isDirty(s)).toBe(false);
  });
  it("저장하면 기준이 새 글·새 mtime 이 되고 잠깐 Saved 를 켠다", () => {
    let s = reduce(opened(), { t: "edit", text: "new" });
    s = reduce(s, { t: "saved", mtimeMs: 99 });
    expect(s.doc?.text).toBe("new");
    expect(s.doc?.mtimeMs).toBe(99);
    expect(isDirty(s)).toBe(false);
    expect(s.flash).toBe(true);
    expect(reduce(s, { t: "flashOff" }).flash).toBe(false);
  });
  it("닫으면 처음 상태", () => {
    expect(reduce(opened(), { t: "close" })).toEqual(initial);
  });
  it("S-1880 초안이 디스크 글과 다르면 초안을 보이고 띠 recovered, Discard 하면 디스크 글", () => {
    let s = reduce(initial, { t: "open", doc: doc(), draft: { text: "draft", baseMtime: 10 } });
    expect(s.text).toBe("draft");
    expect(s.banner?.kind).toBe("recovered");
    expect(isDirty(s)).toBe(true);
    s = reduce(s, { t: "discardDraft" });
    expect(s.text).toBe("one\ntwo");
    expect(s.banner).toBeNull();
    expect(isDirty(s)).toBe(false);
  });
  it("S-1880 초안이 디스크 글과 같으면 띠 없음", () => {
    const s = reduce(initial, { t: "open", doc: doc(), draft: { text: "one\ntwo", baseMtime: 10 } });
    expect(s.banner).toBeNull();
  });
});

describe("S-1882 디스크 변경 띠", () => {
  it("저장이 changed 로 막히면 띠, 글은 그대로 더럽다", () => {
    let s = reduce(opened(), { t: "edit", text: "mine" });
    s = reduce(s, { t: "changed" });
    expect(s.banner?.kind).toBe("changed");
    expect(s.text).toBe("mine");
    expect(isDirty(s)).toBe(true);
  });
  it("Keep mine: 띠를 닫고 다음 저장은 force", () => {
    let s = reduce(reduce(opened(), { t: "edit", text: "mine" }), { t: "changed" });
    s = reduce(s, { t: "keepMine" });
    expect(s.banner).toBeNull();
    expect(s.forced).toBe(true);
    expect(s.text).toBe("mine");
    s = reduce(s, { t: "saved", mtimeMs: 50 });
    expect(s.forced).toBe(false);
  });
  it("Reload: 새 문서로 열면 내 편집이 사라지고 띠도 없다", () => {
    let s = reduce(reduce(opened(), { t: "edit", text: "mine" }), { t: "changed" });
    s = reduce(s, { t: "open", doc: doc({ text: "disk", mtimeMs: 77 }) });
    expect(s.text).toBe("disk");
    expect(s.banner).toBeNull();
    expect(s.doc?.mtimeMs).toBe(77);
  });
});

describe("S-1883~S-1885 인코딩·줄 끝", () => {
  it("encLabel: UTF-8 은 빈 문자열, 나머지는 이름", () => {
    expect(encLabel("utf-8", false)).toBe("");
    expect(encLabel("utf-8", true)).toBe("UTF-8 with BOM");
    expect(encLabel("windows-1252", false)).toBe("Windows-1252");
  });
  it("needsConvert: 1252 파일에 표에 없는 글자가 있을 때만", () => {
    expect(needsConvert("windows-1252", "café €")).toBe(false);
    expect(needsConvert("windows-1252", "한글")).toBe(true);
    expect(needsConvert("utf-8", "한글")).toBe(false);
  });
  it("cantEncode 띠 → Convert to UTF-8: 인코딩이 UTF-8 로 바뀌고 띠가 사라진다(글은 그대로)", () => {
    let s = reduce(opened({ encoding: "windows-1252" }), { t: "edit", text: "한글" });
    s = reduce(s, { t: "cantEncode" });
    expect(s.banner?.kind).toBe("cantEncode");
    s = reduce(s, { t: "convert" });
    expect(s.doc?.encoding).toBe("utf-8");
    expect(s.banner).toBeNull();
    expect(s.text).toBe("한글");
    expect(isDirty(s)).toBe(true);
  });
  it("편집기 위 줄: 경로·언어·N lines·KB, UTF-8·LF 면 덧붙임 없음", () => {
    expect(headParts(doc({ bytes: 2048 }), "a\nb\nc", "ts")).toEqual(["C:/r/a.ts", "ts", "3 lines", "2.0 KB"]);
  });
  it("편집기 위 줄: 인코딩 이름과 CRLF 를 덧붙이고, 둘 다면 둘 다", () => {
    expect(headParts(doc({ bytes: 1024, encoding: "windows-1252" }), "a", "ts").slice(4)).toEqual(["Windows-1252"]);
    expect(headParts(doc({ bytes: 1024, bom: true }), "a", "ts").slice(4)).toEqual(["UTF-8 with BOM"]);
    expect(headParts(doc({ bytes: 1024, crlf: true }), "a", "ts").slice(4)).toEqual(["CRLF"]);
    expect(headParts(doc({ bytes: 1024, encoding: "windows-1252", crlf: true }), "a", "ts").slice(4)).toEqual(["Windows-1252", "CRLF"]);
  });
});

describe("S-1886 밖 위치 허용 기억(메모리 맵)", () => {
  beforeEach(() => outsideMemory.clear());
  it("처음엔 모른다, 답을 기억하고 대소문자·슬래시 차이는 같은 경로", () => {
    expect(outsideMemory.get("D:/x/a.ts")).toBeUndefined();
    outsideMemory.set("D:/x/a.ts", "readonly");
    expect(outsideMemory.get("d:\\X\\a.ts")).toBe("readonly");
    outsideMemory.set("D:/x/a.ts", "allow");
    expect(outsideMemory.get("D:/x/a.ts")).toBe("allow");
    outsideMemory.clear();
    expect(outsideMemory.get("D:/x/a.ts")).toBeUndefined();
  });
  it("읽기 전용으로 두면 Save 가 꺼진다", () => {
    let s = reduce(opened({ outside: true }), { t: "readOnly" });
    s = reduce(s, { t: "edit", text: "x" });
    expect(s.readOnly).toBe(true);
    expect(canSave(s)).toBe(false);
  });
});

describe("S-1876 강조 초과 분기", () => {
  it("120,000자까지는 칠하고 넘으면 끈다", () => {
    expect(HIGHLIGHT_MAX).toBe(120_000);
    expect(shouldHighlight(0)).toBe(true);
    expect(shouldHighlight(120_000)).toBe(true);
    expect(shouldHighlight(120_001)).toBe(false);
  });
});
