import { Terminal } from "@xterm/xterm";
import { describe, expect, it } from "vitest";
import { promptCaret } from "./imeSpot";
import { useUnicode11 } from "./unicode";

// 녹화 rec_1026_235106: Claude 가 일하는 중 화면(커서 숨김·오른쪽 아래). 조합 글자는 입력 줄 글 끝에 떠야 한다
const screen = async (lines: string[]): Promise<Terminal> => {
  const term = new Terminal({ cols: 40, rows: 10, allowProposedApi: true });
  useUnicode11(term);
  await new Promise<void>((r) => term.write(lines.join("\r\n") + "\x1b[?25l\x1b[10;40H", r));
  return term;
};
const BAR = "─".repeat(40);

describe("Claude 입력 줄 글 끝 찾기", () => {
  it("한글 입력 뒤(한글은 2칸)", async () => {
    const t = await screen(["● Manifesting…", "> 블록 인용 아님", BAR, "❯ ㅇㅇ안녕", BAR, "  bypass permissions on"]);
    expect(promptCaret(t.buffer.active, t.rows)).toEqual({ x: 10, y: 3 });
  });
  it("빈 입력이면 ❯ 다음 칸", async () => {
    const t = await screen([BAR, "❯ ", BAR]);
    expect(promptCaret(t.buffer.active, t.rows)).toEqual({ x: 2, y: 1 });
  });
  it("여러 줄 입력이면 마지막 줄 끝", async () => {
    const t = await screen([BAR, "❯ 첫 줄", "  둘째", BAR]);
    expect(promptCaret(t.buffer.active, t.rows)).toEqual({ x: 6, y: 2 });
  });
  it("흐린 안내문은 글로 치지 않는다", async () => {
    const t = await screen([BAR, "❯ \x1b[2mTry this\x1b[0m", BAR]);
    expect(promptCaret(t.buffer.active, t.rows)).toEqual({ x: 2, y: 1 });
  });
  it("테두리 아래가 아닌 > 는 입력 줄이 아니다", async () => {
    const t = await screen(["> 인용문", "그냥 글"]);
    expect(promptCaret(t.buffer.active, t.rows)).toBeNull();
  });
});
