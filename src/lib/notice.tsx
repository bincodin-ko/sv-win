// FX7: 앱 어디서든 한 줄 알림(몇 초 뒤 사라짐). 실패를 console 에만 남기지 않으려고 쓴다
import { create } from "zustand";

export type NoticeAction = { label: string; run: () => void };
const useNotice = create<{ text: string | null; actions?: NoticeAction[] }>(() => ({ text: null }));
let timer: ReturnType<typeof setTimeout> | undefined;

/** actions(S-2667): 글 옆 단추들. 누르면 run 을 부르고 알림을 닫는다. 없으면 예전과 같다 */
export function showNotice(text: string, ms = 4000, actions?: NoticeAction[]): void {
  clearTimeout(timer);
  useNotice.setState({ text, actions });
  timer = setTimeout(() => useNotice.setState({ text: null, actions: undefined }), ms);
}

export function AppNotice() {
  const text = useNotice((s) => s.text);
  const actions = useNotice((s) => s.actions);
  if (!text) return null;
  return (
    <div data-testid="app-notice" role="status" style={{ position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)", zIndex: 10001, padding: "8px 14px", background: "var(--surface)", color: "var(--fg)", border: "1px solid var(--bd)", borderRadius: 10, boxShadow: "0 6px 24px var(--scrim-50)", font: "13px system-ui" }}>
      {text}
      {actions?.map((a) => (
        <button key={a.label} onClick={() => { clearTimeout(timer); useNotice.setState({ text: null, actions: undefined }); a.run(); }}
          style={{ marginLeft: 10, padding: "2px 10px", borderRadius: 6, border: "1px solid var(--bd)", background: "var(--surface-2)", color: "var(--fg)", font: "inherit", cursor: "pointer" }}>{a.label}</button>
      ))}
    </div>
  );
}
