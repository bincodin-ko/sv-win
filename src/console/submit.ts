// B15 S-605·S-668: 한 줄 전송 함수 (B12 의 대기 규칙이 이 위에 얹힌다)
export interface Writable {
  write(data: string): void;
  /** 콘솔이 bracketed paste 모드인가 */
  bracketedPaste(): boolean;
}
export const SUBMIT_DELAY_MS = 150;
/** 줄바꿈은 공백으로 접어 붙여 넣고(bracketed paste 모드면 그것으로), 150ms 뒤 Enter(`\r`) */
export async function typeAndSubmit(s: Writable, text: string): Promise<void> {
  const one = text.replace(/\r\n|\r|\n/g, " ");
  s.write(s.bracketedPaste() ? `\x1b[200~${one}\x1b[201~` : one);
  await new Promise((r) => setTimeout(r, SUBMIT_DELAY_MS));
  s.write("\r");
}
