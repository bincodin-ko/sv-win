// S-2412: 한글 입력기가 켜져 있으면 KeyboardEvent.key 가 자모("ㅁ")나 "Process" 로 온다. 영문 글자·숫자 키는 event.code 로 잡는다.
export function keyFromEvent(e: { key: string; code: string }): string {
  const m = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(e.code);
  if (m && (e.key === "Process" || e.key === "Unidentified" || (e.key.length === 1 && e.key.charCodeAt(0) > 127))) return (m[1] ?? m[2]!).toLowerCase();
  return e.key;
}
