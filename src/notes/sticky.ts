// S-840~S-842·S-849: 스티커 노트 순수 부분 (글자 크기 단계, 종이 색 순환, 노드 필드)
export const STICKY_SIZE = { w: 220, h: 220 }; // 추측(S-840)
/** 종이 색 6개(순환 순서 = 추측, S-842). 값은 theme/tokens.css 의 --paper-<이름> */
export const PAPERS = ["yellow", "pink", "blue", "green", "orange", "lilac"] as const;
export const DEFAULT_PAPER: string = PAPERS[0];
export const NEW_NOTE_SIZE = 18; // 새 노트 약 18
export const MAX_NOTE_SIZE = 20; // 시작 최대 20
export const MIN_NOTE_SIZE = 11;
export const STICKY_PAD = 14; // 글 둘레 여백(px)
export const paperVar = (c: unknown): string => `var(--paper-${(PAPERS as readonly string[]).includes(c as string) ? c : DEFAULT_PAPER})`;

/** 다음 종이 색. 모르는 이름은 기본 색으로 보고 그 다음 */
export function nextPaper(c: unknown): string {
  const i = (PAPERS as readonly string[]).indexOf(c as string);
  return PAPERS[((i < 0 ? 0 : i) + 1) % PAPERS.length]!;
}

const CHAR_W = 0.56, LINE_H = 1.3; // 글자 폭/줄 높이 비율. 어림값 — 실제 글꼴이 다르면 11pt 에서 세로 스크롤이 받아낸다

/** fs 크기로 쓰면 box 안 글 영역에 몇 줄이 필요한가 (낱말 단위 줄바꿈 어림) */
function linesNeeded(text: string, fs: number, innerW: number): number {
  const cols = Math.max(1, Math.floor(innerW / (fs * CHAR_W)));
  let lines = 0;
  for (const para of text.split("\n")) {
    let cur = 0, n = 1;
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (word.length > cols) { // 긴 낱말은 글자 단위로 쪼개진다
        if (cur) n++;
        n += Math.ceil(word.length / cols) - 1;
        cur = word.length % cols || cols;
      } else if (cur && cur + 1 + word.length > cols) { n++; cur = word.length; }
      else cur += (cur ? 1 : 0) + word.length;
    }
    lines += n;
  }
  return lines;
}

/**
 * 글이 늘수록 줄어드는 글자 크기(S-841): 시작은 새 노트 18(노트가 더 넓으면 최대 20)에서 1pt 씩 내려 처음으로 들어가는 크기, 11 아래로는 안 간다.
 * 11 에서도 넘치면 11 그대로(화면이 노트 안 세로 스크롤로 받는다)
 */
export function fitFontSize(text: string, box: { w: number; h: number }): number {
  const start = box.w * box.h > STICKY_SIZE.w * STICKY_SIZE.h ? MAX_NOTE_SIZE : NEW_NOTE_SIZE;
  const iw = box.w - STICKY_PAD * 2, ih = box.h - STICKY_PAD * 2;
  for (let fs = start; fs > MIN_NOTE_SIZE; fs--) if (linesNeeded(text, fs, iw) * fs * LINE_H <= ih) return fs;
  return MIN_NOTE_SIZE;
}

/** 새 스티커 노드의 종류별 필드 (S-849: 명령줄 "add a note that says …" 가 부른다) */
export function makeSticky(text = "", color: string = DEFAULT_PAPER): Record<string, unknown> {
  return { text, color };
}
