import { describe, expect, it } from "vitest";
import { escStep } from "./keys";

// F3 S-2273: Esc 순서 ① 음성(듣는 중·받아쓰기 중·읽는 중) ② 열린 메뉴·대화상자·스튜디오 ③ 선택 해제 ④ Select 도구
const all = { voice: true, overlay: true, selection: 2, tool: "pen" };
describe("escStep", () => {
  it("순서대로 하나씩", () => {
    expect(escStep(all)).toBe("voice");
    expect(escStep({ ...all, voice: false })).toBe("overlay");
    expect(escStep({ ...all, voice: false, overlay: false })).toBe("selection");
    expect(escStep({ ...all, voice: false, overlay: false, selection: 0 })).toBe("tool");
    expect(escStep({ voice: false, overlay: false, selection: 0, tool: "select" })).toBe("none");
  });
});
