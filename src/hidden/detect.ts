// D2 S-1204·S-1205: 화면 글자에서 신뢰 질문·막힘(사람이 답해야 하는 질문)을 알아본다. 순수 함수
// 문구는 CLI 가 바뀌면 달라진다(추측) — 여기 한 곳만 고치면 된다
const TRUST = [/trust the files in this folder/i, /trust the contents of this directory/i];
const BLOCKED = [
  /select login method/i,
  /paste code here/i,
  /(please|you must|need to) (sign|log) ?in/i,
  /(sign|log) in to continue/i,
  /update (available|required)|new version .*available/i,
  /do you want to (proceed|allow|update|make this edit|create)/i,
  /allow .{1,40} to (run|access|use|read|edit)/i,
];
export function detectTrust(screen: string): boolean {
  return TRUST.some((r) => r.test(screen));
}
/** 자동 수락 대상이 아닌 입력 대기. 걸리면 그 문구, 아니면 null */
export function detectBlocked(screen: string): string | null {
  for (const r of BLOCKED) {
    const m = r.exec(screen);
    if (m) return m[0];
  }
  return null;
}
