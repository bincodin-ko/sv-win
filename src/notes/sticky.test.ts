import { describe, expect, it } from "vitest";
import { DEFAULT_PAPER, MAX_NOTE_SIZE, MIN_NOTE_SIZE, NEW_NOTE_SIZE, PAPERS, STICKY_SIZE, fitFontSize, makeSticky, nextPaper } from "./sticky";

describe("S-840 기본값", () => {
  it("기본 220×220(추측), 새 노트 18pt, 최대 20pt, 최소 11pt", () => {
    expect(STICKY_SIZE).toEqual({ w: 220, h: 220 });
    expect([NEW_NOTE_SIZE, MAX_NOTE_SIZE, MIN_NOTE_SIZE]).toEqual([18, 20, 11]);
  });
});
describe("S-841 글자 크기는 글이 늘수록 줄어든다", () => {
  it("빈 글·짧은 글은 새 노트 크기 18", () => {
    expect(fitFontSize("", STICKY_SIZE)).toBe(NEW_NOTE_SIZE);
    expect(fitFontSize("hi", STICKY_SIZE)).toBe(NEW_NOTE_SIZE);
  });
  it("글이 늘면 줄어들기만 하고(올라가지 않음) 11 아래로 안 간다", () => {
    let prev = Infinity;
    const seen = new Set<number>();
    for (let n = 0; n <= 3000; n += 10) {
      const s = fitFontSize("word ".repeat(n / 5), STICKY_SIZE);
      expect(s).toBeLessThanOrEqual(prev);
      expect(s).toBeGreaterThanOrEqual(MIN_NOTE_SIZE);
      expect(Number.isInteger(s)).toBe(true);
      seen.add(s);
      prev = s;
    }
    expect(prev).toBe(MIN_NOTE_SIZE);
    expect(seen.size).toBeGreaterThan(3); // 1pt 단계로 여러 번 줄어듦
  });
  it("넓은 노트의 시작 크기는 최대 20", () => {
    expect(fitFontSize("", { w: 440, h: 440 })).toBe(MAX_NOTE_SIZE);
  });
  it("11pt에서도 넘치는 글은 11 그대로(스크롤은 화면 몫)", () => {
    expect(fitFontSize("x".repeat(20000), STICKY_SIZE)).toBe(MIN_NOTE_SIZE);
  });
});
describe("S-842 종이 색 순환", () => {
  it("6색, 기본 첫 색", () => {
    expect(PAPERS).toHaveLength(6);
    expect(new Set(PAPERS).size).toBe(6);
    expect(DEFAULT_PAPER).toBe(PAPERS[0]);
  });
  it("누를 때마다 다음 색, 마지막 다음은 처음", () => {
    let c: string = PAPERS[0]!;
    const walked: string[] = [c];
    for (let i = 0; i < 6; i++) { c = nextPaper(c); walked.push(c); }
    expect(walked.slice(0, 6)).toEqual([...PAPERS]);
    expect(walked[6]).toBe(PAPERS[0]);
  });
  it("모르는 색 이름은 기본 색으로 보고 그 다음 색", () => expect(nextPaper("???")).toBe(PAPERS[1]));
});
describe("S-849 makeSticky", () => {
  it("글과 색을 받아 노드 필드를 만든다", () => {
    expect(makeSticky("ship the beta on Friday")).toEqual({ text: "ship the beta on Friday", color: DEFAULT_PAPER });
    expect(makeSticky("a", PAPERS[2])).toEqual({ text: "a", color: PAPERS[2] });
    expect(makeSticky()).toEqual({ text: "", color: DEFAULT_PAPER });
  });
});
