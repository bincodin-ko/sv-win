// S-607: 화면 마지막 줄들에서 권한/질문 프롬프트를 알아본다. 인식 문구는 이 파일 한 곳에만 둔다(추측 목록).
const PATTERNS: RegExp[] = [
  // Claude Code: 권한·편집 확인, 폴더 신뢰, 번호 선택 목록
  /Do you want to (proceed|make this edit|create|allow|run|apply)/i,
  /Do you trust the files in this folder/i,
  /^\s*[❯›>]?\s*1\.\s*Yes\b/,
  /\besc to (cancel|exit)\b/i,
  // Codex: 승인 선택 목록
  /Would you like to run the following command/i,
  /Allow (command|Codex)\b.*\?/i,
  /Press enter to confirm or esc to cancel/i,
  // 일반 y/n
  /\((y\/n|Y\/n|y\/N)\)\s*:?\s*$/,
];

export function showsPrompt(lines: string[]): boolean {
  return lines.some((l) => PATTERNS.some((p) => p.test(l)));
}
