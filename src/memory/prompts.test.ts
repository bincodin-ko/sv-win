import { describe, expect, it } from "vitest";
import { KINDS } from "./facts";
import { judgePrompt, QUALITY_COUNT, refreshPrompt, scanPrompt } from "./prompts";

describe("S-1381 scanPrompt", () => {
  it("읽기만 하라고 하고, 종류 6개와 JSON 배열 하나만 요구한다", () => {
    const p = scanPrompt("balanced");
    expect(p).toContain("Do not change any file");
    for (const k of KINDS) expect(p).toContain(k);
    expect(p).toContain('[{"kind","title","body"}]');
    expect(p).toMatch(/only (a|one) JSON array/i);
  });
  it("품질별 개수 6·10·14", () => {
    expect(QUALITY_COUNT).toEqual({ quick: 6, balanced: 10, thorough: 14 });
    expect(scanPrompt("quick")).toContain("about 6 facts");
    expect(scanPrompt("balanced")).toContain("about 10 facts");
    expect(scanPrompt("thorough")).toContain("about 14 facts");
  });
});
describe("S-1386 refreshPrompt", () => {
  it("그 사실을 보여 주고 {status} JSON 하나를 요구한다", () => {
    const p = refreshPrompt({ kind: "Commands", title: "Build it", body: "npm run build" });
    for (const s of ["Build it", "npm run build", "Do not change any file", '"ok"', '"changed"', '"gone"', "status"]) expect(p).toContain(s);
    expect(p).toMatch(/only (a|one) JSON object/i);
  });
});
describe("S-1470 judgePrompt", () => {
  it("MET 또는 NOT MET 으로만 답하고 명령은 실행하지 않는다", () => {
    const p = judgePrompt("All tests pass");
    expect(p).toContain("All tests pass");
    expect(p).toContain("MET");
    expect(p).toContain("NOT MET");
    expect(p).toMatch(/only/i);
    expect(p).toContain("Do not run any command");
  });
});
