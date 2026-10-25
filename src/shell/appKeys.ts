// B4 S-342: 앱 전체 키(캡처 단계라 콘솔이 키보드를 가져도 앱이 먼저 받는다)
export type AppKeyAction = "home" | "closeRepo" | "openFolder" | "regionNext" | "regionPrev" | "consoleNext" | "consolePrev" | "commandBar" | "tabPrev" | "tabNext"; // 뒤 일곱은 U2(S-2620~S-2625)
export type KeyLike = { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean };

export function keyAction(e: KeyLike, ctx: { view: "home" | "board"; consoleFocus: boolean }): AppKeyAction | null {
  if (e.altKey || e.metaKey) return null;
  const k = e.key.toLowerCase();
  // U2: 홈 화면에는 영역·콘솔·탭이 없다
  if (ctx.view === "board") {
    if (k === "f6") return e.ctrlKey ? (e.shiftKey ? "consolePrev" : "consoleNext") : e.shiftKey ? "regionPrev" : "regionNext";
    if (e.ctrlKey && e.shiftKey && k === "p") return "commandBar";
    if (e.ctrlKey && !e.shiftKey && (k === "pageup" || k === "pagedown")) return k === "pageup" ? "tabPrev" : "tabNext";
  }
  if (!e.ctrlKey) return null;
  if (e.shiftKey) return k === "l" ? "home" : k === "w" ? "closeRepo" : null;
  // Ctrl+O 는 Claude Code 도 쓰므로 콘솔이 키보드를 가졌으면 양보(홈에서는 받는다)
  return k === "o" && (ctx.view === "home" || !ctx.consoleFocus) ? "openFolder" : null;
}
/** repo 닫기 확인을 거칠지: 버튼은 항상, 단축키는 실행 중 에이전트가 있을 때만(S-333) */
export function closeRepoAsk(source: "button" | "key", running: number): boolean {
  return source === "button" || running > 0;
}

/** window 캡처 단계에 건다. 돌려주는 함수로 뗀다 */
export function installAppKeys(run: (a: AppKeyAction) => void, ctx: () => { view: "home" | "board"; consoleFocus: boolean }): () => void {
  const onKey = (e: KeyboardEvent) => {
    const a = keyAction(e, ctx());
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    run(a);
  };
  window.addEventListener("keydown", onKey, true);
  return () => window.removeEventListener("keydown", onKey, true);
}
/** 콘솔(xterm)이 키보드를 갖고 있나 */
export const consoleHasFocus = (): boolean => !!document.activeElement?.closest(".xterm");
