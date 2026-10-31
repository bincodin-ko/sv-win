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

// 대기열 3번: 조합 상자가 콘솔 왼쪽 위에 뜨던 것 — 커서가 화면 밖이어도 자리를 잡는다
import { imeSpot } from "./imeSpot";
describe("조합 글자 자리(imeSpot)", () => {
  const lines = async (n: number, tail = "") => {
    const term = new Terminal({ cols: 40, rows: 10, scrollback: 100, allowProposedApi: true });
    await new Promise<void>((r) => term.write(Array.from({ length: n }, (_, i) => `line ${i}`).join("\r\n") + tail, r));
    return term;
  };
  it("커서가 보이고 화면 안이면 커서 자리", async () => {
    const t = await lines(3, "\r\n$ ab");
    expect(imeSpot(t.buffer.active, t.rows, t.cols, false, null)).toEqual({ x: 4, y: 3 });
  });
  it("위로 스크롤해 커서가 화면 밖이면 왼쪽 위(0,0)가 아니라 마지막 자리", async () => {
    const t = await lines(40, "\r\n$ ab");
    t.scrollLines(-20);
    expect(imeSpot(t.buffer.active, t.rows, t.cols, false, { x: 4, y: 9 })).toEqual({ x: 4, y: 9 });
  });
  it("마지막 자리도 없으면 커서를 화면 안으로 당긴 자리(맨 아래 줄)", async () => {
    const t = await lines(40, "\r\n$ ab");
    t.scrollLines(-20);
    expect(imeSpot(t.buffer.active, t.rows, t.cols, false, null)).toEqual({ x: 4, y: 9 });
  });
});
