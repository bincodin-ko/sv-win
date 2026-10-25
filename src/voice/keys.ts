// S-2273 Esc 순서(순수): ① 음성 취소(읽는 중 포함) ② 열린 메뉴·대화상자·스튜디오 ③ 선택 해제 ④ Select 도구
export type EscStep = "voice" | "overlay" | "selection" | "tool" | "none";
export const escStep = (i: { voice: boolean; overlay: boolean; selection: number; tool: string }): EscStep =>
  i.voice ? "voice" : i.overlay ? "overlay" : i.selection > 0 ? "selection" : i.tool !== "select" ? "tool" : "none";

/** 이 Esc 를 음성이 가져갔다(Board 가 같은 Esc 로 선택을 풀지 않게). Host 가 표시, Board 가 확인 */
export const escTaken = new WeakSet<Event>();
