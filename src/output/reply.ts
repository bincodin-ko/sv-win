// B15 S-660·S-661: 출력 viewer 가 쓰는 순수 함수 (제안 기준, 화면 방식 답 뽑기)
/** 빈 줄로 나뉜 문단 수 */
export const paragraphs = (text: string): number => text.split(/\n\s*\n/).filter((p) => p.trim()).length;
/** S-660: 약 80자 이상이거나 3문단 이상이면 See output 을 보인다 */
export const shouldOffer = (text: string): boolean => text.trim().length >= 80 || paragraphs(text) >= 3;
/** S-661: 화면(xterm 버퍼 줄들)에서 마지막 입력 줄 뒤의 출력. lastInputLine 이 -1 이면 처음부터 */
export function screenReply(lines: string[], lastInputLine: number): string {
  const out = lines.slice(Math.max(lastInputLine + 1, 0)).map((l) => l.trimEnd());
  while (out.length && !out[0]) out.shift();
  while (out.length && !out[out.length - 1]) out.pop();
  return out.join("\n");
}

/** Save .md 첫 줄(S-665): `Saved 2026-10-24 14:30 · Otto (Claude)` 와 파일 이름용 `20261024-1430` (지역 시각) */
export function savedStamps(now: Date, name: string, agent: string): { header: string; stamp: string } {
  const p = (n: number) => String(n).padStart(2, "0");
  const d = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  const t = `${p(now.getHours())}:${p(now.getMinutes())}`;
  return { header: `Saved ${d} ${t} · ${name} (${agent})`, stamp: `${d.replace(/-/g, "")}-${p(now.getHours())}${p(now.getMinutes())}` };
}

/** 문서처럼 보이기(S-663): ``` 울타리 안은 코드 조각, 나머지는 글 조각 */
export function splitBlocks(text: string): { code: boolean; text: string }[] {
  const out: { code: boolean; text: string }[] = [];
  let buf: string[] = [];
  let code = false;
  const flush = () => {
    if (buf.length || code) out.push({ code, text: buf.join("\n") });
    buf = [];
  };
  for (const line of text.split("\n")) {
    if (/^\s*```/.test(line)) {
      flush();
      code = !code;
    } else buf.push(line);
  }
  flush();
  return out.filter((b) => b.code || b.text.trim());
}
