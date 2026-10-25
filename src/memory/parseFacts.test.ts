import { describe, expect, it } from "vitest";
import { NO_FACTS, parseFacts, parseRefresh, parseVerdict } from "./parseFacts";

const f = (o: object = {}) => ({ kind: "Commands", title: "Build", body: "npm run build", ...o });

describe("S-1383 parseFacts", () => {
  it("코드 펜스 안의 JSON 배열", () => {
    const t = "Here you go:\n```json\n" + JSON.stringify([f()]) + "\n```\nDone.";
    expect(parseFacts(t)).toEqual([f()]);
  });
  it("펜스 없이 앞뒤 글이 있어도, 앞 글에 [x] 같은 대괄호가 있어도", () => {
    expect(parseFacts("Notes [see below] " + JSON.stringify([f(), f({ title: "Test" })]) + " bye")).toHaveLength(2);
  });
  it("kind 6종 밖·제목이 비거나 글자가 아닌 항목은 버린다", () => {
    const r = parseFacts(JSON.stringify([f({ kind: "Other" }), f({ title: "  " }), f({ title: 5 }), f({ kind: "Gotchas", title: "Keep" })]));
    expect(r.map((x) => x.title)).toEqual(["Keep"]);
  });
  it("제목 80자·본문 600자로 자르고, 본문이 없으면 빈 글", () => {
    const [a, b] = parseFacts(JSON.stringify([f({ title: "t".repeat(100), body: "b".repeat(700) }), { kind: "Context", title: "No body" }]));
    expect(a!.title).toHaveLength(80);
    expect(a!.body).toHaveLength(600);
    expect(b!.body).toBe("");
  });
  it("최대 20개", () => {
    expect(parseFacts(JSON.stringify(Array.from({ length: 25 }, (_, i) => f({ title: `T${i}` }))))).toHaveLength(20);
  });
  it("하나도 못 얻으면 오류 문구: 0개·JSON 깨짐·배열 아님·빈 답", () => {
    for (const t of ["[]", '[{"kind":"Commands","title":"x"', '{"kind":"Commands"}', "", JSON.stringify([f({ kind: "Nope" })])]) {
      expect(() => parseFacts(t)).toThrow(NO_FACTS);
    }
    expect(NO_FACTS).toBe("No facts came back. Try again or pick another agent.");
  });
});

describe("S-1386 parseRefresh", () => {
  it("ok·changed(본문 있음)·gone, 펜스 허용", () => {
    expect(parseRefresh('{"status":"ok"}')).toEqual({ status: "ok" });
    expect(parseRefresh('```json\n{"status":"changed","body":"new text"}\n```')).toEqual({ status: "changed", body: "new text" });
    expect(parseRefresh('Result: {"status":"gone"}')).toEqual({ status: "gone" });
  });
  it("changed 인데 본문이 없거나 모르는 status·깨진 JSON 은 null", () => {
    for (const t of ['{"status":"changed"}', '{"status":"maybe"}', '{"status":', "nothing"]) expect(parseRefresh(t)).toBeNull();
  });
});

describe("S-1470 parseVerdict", () => {
  it("MET / NOT MET (대소문자·마침표·굵게 표시 무시)", () => {
    expect(parseVerdict("MET")).toBe("met");
    expect(parseVerdict(" **Met.** ")).toBe("met");
    expect(parseVerdict("NOT MET")).toBe("notMet");
    expect(parseVerdict("not met.")).toBe("notMet");
  });
  it("그 밖은 판단 못 함", () => {
    for (const t of ["", "maybe", "The goal is met", "METAL", "NOT MET because x"]) expect(parseVerdict(t)).toBe("unknown");
  });
});
