import { Terminal } from "@xterm/xterm";
import { describe, expect, it } from "vitest";
import { useUnicode11 } from "./unicode";

// 기대 폭 = Claude Code 2.1.310 이 쓰는 폭(Bun CellSegmenter, ambiguousIsNarrow) = npm string-width 와 같은 값.
// 실측(2026-10-26, y8-diag/widths.mjs): xterm 기본(Unicode 6)은 이모지 ✅❌🚀📦🔥👍🟢⭐⏳✨ 를 1칸으로 센다, Claude 는 2칸.
// 한글·가운뎃점·줄표·괄호·박스 문자는 두 쪽이 같다(회귀 방지로 같이 건다).
const WIDTHS: [string, number][] = [
  ["가", 2], ["힣", 2], ["ㅏ", 2], ["·", 1], ["—", 1], ["(", 1], [")", 1], ["/", 1],
  ["─", 1], ["│", 1], ["┌", 1], ["┬", 1], ["┼", 1], ["┘", 1], ["✓", 1], ["❯", 1], ["●", 1],
  ["✅", 2], ["❌", 2], ["🚀", 2], ["📦", 2], ["🔥", 2], ["👍", 2], ["🟢", 2], ["⭐", 2], ["⏳", 2], ["✨", 2],
];

const cursorAfter = async (term: Terminal, s: string): Promise<number> => {
  await new Promise<void>((r) => term.write("\x1b[2J\x1b[H" + s, r));
  return term.buffer.active.cursorX;
};

describe("터미널 글자 폭이 Claude 와 같다", () => {
  it("글자마다 차지하는 칸 수", async () => {
    const term = new Terminal({ cols: 40, rows: 5, allowProposedApi: true });
    useUnicode11(term);
    const bad: string[] = [];
    for (const [ch, w] of WIDTHS) {
      const got = await cursorAfter(term, ch);
      if (got !== w) bad.push(`${ch} 기대 ${w} 실제 ${got}`);
    }
    expect(bad).toEqual([]);
  });
});
