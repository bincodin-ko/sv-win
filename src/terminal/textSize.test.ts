import { describe, expect, it } from "vitest";
import { useBoard } from "../board/store";
import { BASE_FONT_PX, fontSizeFor, setConsoleTextSize } from "./textSize";

describe("S-073/S-134 글자 크기", () => {
  it("글꼴 12.5px × 배율, 전역(null)은 100%", () => {
    expect(BASE_FONT_PX).toBe(12.5);
    expect(fontSizeFor(null)).toBe(12.5);
    expect(fontSizeFor(200)).toBe(25);
    expect(fontSizeFor(85)).toBeCloseTo(10.625, 5);
  });
  it("S-363 노드 값이 없으면(null) 설정의 전체 배율을 따른다, 노드 값이 우선", () => {
    expect(fontSizeFor(null, 150)).toBeCloseTo(18.75, 5);
    expect(fontSizeFor(200, 150)).toBe(25);
    expect(fontSizeFor(null)).toBe(12.5);
  });
  it("setConsoleTextSize: 숫자는 그 콘솔만, global 은 null", () => {
    const a = useBoard.getState().spawnConsole("shell");
    const b = useBoard.getState().spawnConsole("shell");
    setConsoleTextSize(a, 150);
    expect(useBoard.getState().nodes[a]).toMatchObject({ textSize: 150 });
    expect(useBoard.getState().nodes[b]).toMatchObject({ textSize: null });
    setConsoleTextSize(a, "global");
    expect(useBoard.getState().nodes[a]).toMatchObject({ textSize: null });
  });
});
