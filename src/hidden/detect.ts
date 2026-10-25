// D2 S-1204·S-1205: 화면 글자에서 신뢰 질문·막힘(사람이 답해야 하는 질문)을 알아본다. 순수 함수
// 문구는 CLI 가 바뀌면 달라진다(추측) — 여기 한 곳만 고치면 된다
const TRUST = [/trust the files in this folder/i, /trust the contents of this directory/i, /one you trust/i, /Yes, I trust this folder/i, /Do you trust this folder/i]; // 마지막: Gemini CLI [추측]
 // 뒤 둘: Claude Code 2.1.310
const BLOCKED = [
  /select login method/i,
  /paste code here/i,
  /(please|you must|need to) (sign|log) ?in/i,
  /(sign|log) in to continue/i,
  /update (available|required)|new version .*available/i,
  /do you want to (proceed|allow|update|make this edit|create)/i,
  /allow .{1,40} to (run|access|use|read|edit)/i,
  /waiting for auth|login with google|how would you like to authenticate/i, // Gemini CLI [추측]
  /no providers? (configured|found)/i, // OpenCode [추측]
];
// 도구 권한 질문(Claude Code). 새 콘솔에는 이 질문이 없어서 '콘솔을 열어 답하라'가 틀린 안내가 된다
const PERMISSION = [/do you want to (proceed|allow|make this edit|create)/i, /allow .{1,40} to (run|access|use|read|edit)/i];
const MAX_LINE = 160;
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

export type BlockKind = "trust" | "permission" | "other";
/** 막힘 종류와 (permission 이면) 화면 끝의 질문 한 줄 */
export function classifyBlock(screen: string): { kind: BlockKind; line: string } {
  if (detectTrust(screen)) return { kind: "trust", line: "" };
  const lines = screen.split("\n").map((l) => l.replace(/[│╭╮╰╯─]/g, " ").replace(/\s+/g, " ").trim());
  const at = lines.length - 1 - [...lines].reverse().findIndex((l) => PERMISSION.some((r) => r.test(l)));
  if (at >= lines.length) return { kind: "other", line: "" };
  const line = lines.slice(0, at + 1).filter(Boolean).slice(-3).join(" ").slice(-MAX_LINE); // 앞 두 줄(도구·명령) + 질문
  return { kind: "permission", line };
}
