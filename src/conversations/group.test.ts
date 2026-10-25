import { describe, expect, it } from "vitest";
import type { Conversation } from "../lib/ipc";
import { canPlace, filterConvs, groupRows, sameFolderKey } from "./group";

const NOW = new Date(2026, 9, 25, 15, 0).getTime(); // 2026-10-25 15:00 로컬
const DAY = 86400000;
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime();
const c = (id: string, cwd: string | null, lastAt: number, o: Partial<Conversation> = {}): Conversation => ({
  cli: "claude", sessionId: id, cwd, cwdExists: cwd !== null, title: `title ${id}`, firstPrompt: `first ${id}`, lastAt, messages: 3, profile: null, ...o,
});

describe("S-2826 같은 폴더 판정", () => {
  it("대소문자·/·\·끝 구분자를 무시한다", () => {
    const k = sameFolderKey("C:\\Users\\Me\\Proj\\");
    expect(sameFolderKey("c:/users/me/proj")).toBe(k);
    expect(sameFolderKey("C:/Users/Me/Proj//")).toBe(k);
    expect(sameFolderKey("C:/Users/Me/Other")).not.toBe(k);
  });
});

describe("S-2825 거르기", () => {
  const L = [
    c("a", "C:/w/Alpha", 3, { title: "Fix Login bug", firstPrompt: "please look" }),
    c("b", "C:/w/beta", 2, { title: "docs", firstPrompt: "write README", cli: "codex" }),
    c("d", null, 1, { title: "zzz", firstPrompt: "hello" }),
  ];
  it("제목·첫 메시지·폴더 경로, 대소문자 무시 부분 일치", () => {
    expect(filterConvs(L, { q: "LOGIN", cli: "all" }).map((x) => x.sessionId)).toEqual(["a"]);
    expect(filterConvs(L, { q: "readme", cli: "all" }).map((x) => x.sessionId)).toEqual(["b"]);
    expect(filterConvs(L, { q: "c:/w/beta", cli: "all" }).map((x) => x.sessionId)).toEqual(["b"]);
    expect(filterConvs(L, { q: "  ", cli: "all" })).toHaveLength(3);
  });
  it("CLI 거르기", () => {
    expect(filterConvs(L, { q: "", cli: "codex" }).map((x) => x.sessionId)).toEqual(["b"]);
    expect(filterConvs(L, { q: "", cli: "claude" })).toHaveLength(2);
  });
});

describe("S-2826 By folder", () => {
  const L = [
    c("1", "C:/w/Alpha", at(2026, 9, 20)),
    c("2", "c:\\w\\beta\\", at(2026, 9, 24)),
    c("3", "c:/w/alpha/", at(2026, 9, 25, 9)), // Alpha 와 같은 폴더, 가장 최근
    c("4", null, at(2026, 9, 25, 10)),          // No folder 는 최근이어도 맨 아래
    c("5", "C:/w/Alpha", at(2026, 9, 1)),
  ];
  const rows = groupRows(L, "folder", NOW, "en");
  it("묶음 순서 = 그 폴더 가장 최근 대화 순, No folder 맨 아래", () => {
    const heads = rows.filter((r) => r.kind === "head");
    expect(heads.map((h) => h.kind === "head" && h.count)).toEqual([3, 1, 1]);
    expect(heads.map((h) => h.kind === "head" && h.label)).toEqual(["alpha", "beta", "No folder"]);
    expect(heads[0]!.kind === "head" && heads[0]!.sub).toBe("c:/w/alpha");
  });
  it("묶음 안은 최근 순, 머리줄 바로 뒤에 대화", () => {
    expect(rows.map((r) => (r.kind === "head" ? "H" : r.conv.sessionId)).join(",")).toBe("H,3,1,5,H,2,H,4");
  });
});

describe("S-2827 By date", () => {
  const L = [
    c("today0", "C:/a", at(2026, 9, 25, 0)),        // 오늘 0시 = Today
    c("yest", "C:/a", at(2026, 9, 24, 23)),         // 어제 23시
    c("d7", "C:/a", at(2026, 9, 18, 5)),            // 7일 전 날(0시 기준 -7일 이내)
    c("d30", "C:/a", at(2026, 8, 26, 5)),           // 30일 전 안
    c("sep", "C:/a", at(2026, 8, 3)),               // 9월
    c("old", "C:/a", at(2025, 11, 31)),             // 2025년 12월
  ];
  it("오늘 0시 기준 묶음과 순서", () => {
    const rows = groupRows(L, "date", NOW, "en");
    const heads = rows.filter((r) => r.kind === "head").map((h) => (h.kind === "head" ? h.label : ""));
    expect(heads).toEqual(["Today", "Yesterday", "Previous 7 days", "Previous 30 days", "September 2026", "December 2025"]);
    expect(rows.filter((r) => r.kind === "conv").map((r) => (r.kind === "conv" ? r.conv.sessionId : ""))).toEqual(["today0", "yest", "d7", "d30", "sep", "old"]);
  });
  it("경계: 어제 0시 정각은 Yesterday, 1ms 전은 Previous 7 days", () => {
    const sod = new Date(2026, 9, 25).getTime();
    const rows = groupRows([c("x", "C:/a", sod - DAY), c("y", "C:/a", sod - DAY - 1)], "date", NOW, "en");
    expect(rows.filter((r) => r.kind === "head").map((h) => (h.kind === "head" ? h.label : ""))).toEqual(["Yesterday", "Previous 7 days"]);
  });
  it("한국어는 월 이름이 한국어", () => {
    const rows = groupRows([c("o", "C:/a", at(2026, 8, 3))], "date", NOW, "ko");
    expect(rows[0]!.kind === "head" && rows[0]!.label).toBe("2026년 9월");
  });
  it("By date 머리줄에는 폴더 경로(sub)가 없다", () => {
    const rows = groupRows(L, "date", NOW, "en");
    expect(rows[0]!.kind === "head" && rows[0]!.sub).toBeUndefined();
  });
});

describe("S-2832 놓기 가능 판정", () => {
  it("폴더 없음 / 디스크에 없음 / 가능", () => {
    expect(canPlace(c("a", null, 1))).toBe("noFolder");
    expect(canPlace(c("a", "C:/gone", 1, { cwdExists: false }))).toBe("missing");
    expect(canPlace(c("a", "C:/ok", 1))).toBeNull();
  });
});
