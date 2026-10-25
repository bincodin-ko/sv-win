import { describe, expect, it } from "vitest";
import { dictationTarget, pillText, recheck, type TargetIn } from "./target";

// F3 S-2275·S-2276: 글이 가는 곳 ① 입력란 ② 키보드를 가진 콘솔 ③ 선택된 실행 중 콘솔 하나 ④ 명령 바
const run = { running: true, needsYou: false };
const base: TargetIn = { field: false, consoleFocus: null, selected: [], consoles: { a: run, b: run, dead: { running: false, needsYou: false }, ask: { running: true, needsYou: true } } };
const T = (p: Partial<TargetIn>) => dictationTarget({ ...base, ...p });

describe("dictationTarget", () => {
  it("① 입력란이 키보드를 가지면 그곳", () => expect(T({ field: true, selected: ["a"] })).toEqual({ kind: "field" }));
  it("② 키보드를 가진 콘솔", () => expect(T({ consoleFocus: "a" })).toEqual({ kind: "console", id: "a" }));
  it("③ 선택된 실행 중 콘솔 하나", () => expect(T({ selected: ["b"] })).toEqual({ kind: "console", id: "b" }));
  it("④ 아무 데도 없으면 명령 바", () => expect(T({})).toEqual({ kind: "bar" }));
  it("선택이 둘 이상이면 명령 바", () => expect(T({ selected: ["a", "b"] })).toEqual({ kind: "bar" }));
  it("NEEDS YOU 콘솔(권한·질문 프롬프트)은 명령 바", () => {
    expect(T({ consoleFocus: "ask" })).toEqual({ kind: "bar" });
    expect(T({ selected: ["ask"] })).toEqual({ kind: "bar" });
  });
  it("끝난 콘솔은 명령 바", () => {
    expect(T({ consoleFocus: "dead" })).toEqual({ kind: "bar" });
    expect(T({ selected: ["dead"] })).toEqual({ kind: "bar" });
  });
  it("모르는 콘솔 id 도 명령 바", () => expect(T({ selected: ["zzz"] })).toEqual({ kind: "bar" }));
});

describe("recheck: 받아쓰는 사이 바뀐 것", () => {
  const con = { kind: "console", id: "a" } as const;
  it("그대로면 그 콘솔", () => expect(recheck(con, { ...run, epoch: 3 }, 3)).toEqual(con));
  it("다시 시작(epoch 달라짐)이면 명령 바", () => expect(recheck(con, { ...run, epoch: 4 }, 3)).toEqual({ kind: "bar" }));
  it("끝났거나 NEEDS YOU 면 명령 바", () => {
    expect(recheck(con, { running: false, needsYou: false, epoch: 3 }, 3)).toEqual({ kind: "bar" });
    expect(recheck(con, { running: true, needsYou: true, epoch: 3 }, 3)).toEqual({ kind: "bar" });
    expect(recheck(con, null, 3)).toEqual({ kind: "bar" });
  });
  it("입력란·명령 바는 그대로", () => {
    expect(recheck({ kind: "field" }, null, 0)).toEqual({ kind: "field" });
    expect(recheck({ kind: "bar" }, null, 0)).toEqual({ kind: "bar" });
  });
});

describe("pillText (S-2276)", () => {
  it("콘솔·명령 바·입력란", () => {
    expect(pillText({ kind: "console", id: "a" }, "Otto")).toBe("Dictating → Otto");
    expect(pillText({ kind: "bar" })).toBe("Dictating → command bar");
    expect(pillText({ kind: "field" })).toBe("Dictating → text field");
  });
});
