// S-1702·S-1703: forward digest(순수 함수). 답 24,000자·전체 72,000자 한도, 목적지별 나누기
export const REPLY_MAX = 24_000;
export const DIGEST_MAX = 72_000;
const CUT = "[cut]";
const SEP = "\n\n";
export type Reply = { name: string; text: string };

export const cutReply = (t: string): string => (t.length > REPLY_MAX ? t.slice(0, REPLY_MAX) + CUT : t);

export function buildDigest(replies: Reply[]): { parts: string[]; digest: string } {
  const parts: string[] = [];
  let used = 0;
  for (const r of replies) {
    const head = `Results from ${r.name}:\n`;
    let part = head + cutReply(r.text);
    const room = DIGEST_MAX - used - (parts.length ? SEP.length : 0);
    if (part.length > room) {
      if (room <= head.length) break;
      parts.push(part.slice(0, room) + CUT); // 전체 한도: 이 답을 자르고 뒤쪽 답은 버린다
      break;
    }
    parts.push(part);
    used += part.length + (parts.length > 1 ? SEP.length : 0);
  }
  return { parts, digest: parts.join(SEP) };
}

/** 목적지 n 개에 보낼 글. null = 받을 부분이 없는 목적지(한가하게 둔다) */
export function divide(parts: string[], n: number, everyone: boolean): (string | null)[] {
  const all = parts.join(SEP);
  if (n <= 1 || everyone) return Array.from({ length: n }, () => all);
  if (parts.length <= 1) return Array.from({ length: n }, (_, i) => (i === 0 ? all : null)); // 나눌 수 없다 → 첫 목적지에 통째로
  return Array.from({ length: n }, (_, i) => {
    const mine = parts.filter((_, j) => j % n === i);
    return mine.length ? mine.join(SEP) : null;
  });
}
