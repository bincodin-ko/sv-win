import { describe, expect, it } from "vitest";
import { paragraphs, screenReply, shouldOffer } from "./reply";

// 명세 S-660: 마친 답이 약 80자 이상이거나 3문단 이상일 때 나타난다 (경계 79/80 은 설명서 지정)
describe("shouldOffer", () => {
  it("79자 한 문단은 아니다, 80자는 맞다", () => {
    expect(shouldOffer("a".repeat(79))).toBe(false);
    expect(shouldOffer("a".repeat(80))).toBe(true);
  });
  it("3문단이면 짧아도 맞다, 2문단은 아니다", () => {
    expect(shouldOffer("a\n\nb\n\nc")).toBe(true);
    expect(shouldOffer("a\n\nb")).toBe(false);
  });
  it("앞뒤 공백은 세지 않는다", () => {
    expect(shouldOffer("  " + "a".repeat(79) + "  \n\n")).toBe(false);
  });
  it("빈 입력은 아니다", () => {
    expect(shouldOffer("")).toBe(false);
    expect(shouldOffer("   \n\n  ")).toBe(false);
  });
});

describe("paragraphs", () => {
  it("빈 줄로 문단을 센다 (여러 빈 줄·공백 줄도 하나)", () => {
    expect(paragraphs("")).toBe(0);
    expect(paragraphs("a")).toBe(1);
    expect(paragraphs("a\nb")).toBe(1);
    expect(paragraphs("a\n\nb")).toBe(2);
    expect(paragraphs("a\n \n\n\nb\n\nc\n")).toBe(3);
  });
});

// 명세 S-661: 그 밖 에이전트는 화면에서 마지막 입력 줄 뒤의 출력
describe("screenReply", () => {
  const lines = ["> hello", "Hi there!", "  How can I help?   ", "", "", "> "];
  it("마지막 입력 줄 뒤만, 줄 끝 공백과 앞뒤 빈 줄은 뺀다", () => {
    expect(screenReply(lines, 0)).toBe("Hi there!\n  How can I help?\n\n\n>");
  });
  it("입력 줄을 모르면(-1) 처음부터", () => {
    expect(screenReply(["a", "", "b", ""], -1)).toBe("a\n\nb");
  });
  it("출력이 없으면 빈 글", () => {
    expect(screenReply(["> x"], 0)).toBe("");
    expect(screenReply(["> x", "", ""], 0)).toBe("");
    expect(screenReply([], -1)).toBe("");
    expect(screenReply(["a"], 5)).toBe("");
  });
});

import { savedStamps, splitBlocks } from "./reply";
describe("savedStamps (S-665)", () => {
  it("날짜 줄과 파일 이름 조각", () => {
    expect(savedStamps(new Date(2026, 9, 24, 14, 30), "Otto", "Claude")).toEqual({ header: "Saved 2026-10-24 14:30 · Otto (Claude)", stamp: "20261024-1430" });
    expect(savedStamps(new Date(2026, 0, 5, 3, 7), "A", "Shell").stamp).toBe("20260105-0307");
  });
});
describe("splitBlocks (S-663)", () => {
  it("코드 울타리를 고정폭 조각으로 나눈다", () => {
    expect(splitBlocks("hi\n\n```ts\nconst x = 1;\n```\n\nbye")).toEqual([
      { code: false, text: "hi\n" },
      { code: true, text: "const x = 1;" },
      { code: false, text: "\nbye" },
    ]);
  });
  it("닫히지 않은 울타리도 끝까지 코드, 빈 글은 []", () => {
    expect(splitBlocks("```\na")).toEqual([{ code: true, text: "a" }]);
    expect(splitBlocks("")).toEqual([]);
  });
});
