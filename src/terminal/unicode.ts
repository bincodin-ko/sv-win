import { Unicode11Addon } from "@xterm/addon-unicode11";
import type { Terminal } from "@xterm/xterm";

/**
 * 글자 폭을 Claude(Unicode 15 기준 string-width / CellSegmenter)와 맞춘다. xterm 기본(Unicode 6)은 이모지를 1칸으로 세어
 * Claude 가 그린 표의 이모지 줄이 한 칸 밀린다. Terminal 은 allowProposedApi: true 로 만들어야 한다.
 */
export function useUnicode11(term: Terminal): void {
  term.loadAddon(new Unicode11Addon());
  term.unicode.activeVersion = "11";
}
