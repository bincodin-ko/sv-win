// S-540~S-552·S-556: 보드 아래 가운데의 명령 바. 모든 워크스페이스 보드에 하나(AppShell 이 보이는 보드에 맞춰 올린다), 홈에는 없다.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getStore } from "../board/boards";
import { boardHasKeyboard, overlayOpen } from "../board/keys";
import { useT } from "../i18n";
import { groupTitle } from "../board/groups";
import { isConsole } from "../board/store";
import { useSettings } from "../settings/useSettings";
import { BarNotice, ListeningBar } from "../voice/ListeningBar";
import { micDown, micUp, useListen } from "../voice/listen";
import "../voice/orb.css";
import { useVoice } from "../voice/status";
import Chips from "./Chips";
import { hintExample } from "./examples";
import { isImeEvent } from "./ime";
import { submit } from "./executor";
import { down, newHist, push, up } from "./history";
import { accept, candidates, mentionAt, mentionOnly } from "./mention";
import MentionMenu from "./MentionMenu";
import ThreadPanel from "./ThreadPanel";
import { mk, useThread } from "./thread";

let hist = newHist(); // S-549: 앱을 켜 둔 동안만(홈에 다녀와도 유지, 저장 안 함)
/** F3 S-2263: 음성으로 보낸 글도 ↑ 이력에 */
export const pushHistory = (t: string) => { hist = push(hist, t); };

const circle = (bg: string): React.CSSProperties => ({ width: 28, height: 28, borderRadius: "50%", border: 0, background: bg, color: "var(--fg)", display: "grid", placeItems: "center", flex: "none" });

export default function CommandBar({ wsId, repo }: { wsId: string; repo: string }) {
  const t = useT();
  const useBoard = getStore(wsId);
  const nodes = useBoard((s) => s.nodes);
  const groups = useBoard((s) => s.groups);
  const open = useThread((s) => s.open);
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const [sel, setSel] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null); // Esc 로 닫은 메뉴는 글이 바뀔 때까지 닫아 둔다
  const [ready, setReady] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const nextCaret = useRef<number | null>(null);
  const hintOff = useSettings((s) => s.s.barHintDismissed) === true;
  const src = useListen((s) => s.src);
  const listening = src === "space" || src === "mic";
  const orbState = useVoice((s) => (s.phase !== "idle" ? s.phase : s.speaking ? "speaking" : "idle")); // S-2270

  useEffect(() => void useThread.getState().load(repo), [repo]);
  useEffect(() => void useSettings.getState().load().then(() => setReady(true)), []); // 힌트가 저장된 설정을 읽은 뒤에만 보이게

  // S-548: Ctrl+K — 콘솔·텍스트 입력이 키보드를 가지지 않았을 때만 바로 간다(콘솔 안에서는 프로그램으로 간다)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey || e.key.toLowerCase() !== "k") return;
      if (!boardHasKeyboard(e.target) || overlayOpen()) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useLayoutEffect(() => {
    if (nextCaret.current !== null) { input.current?.setSelectionRange(nextCaret.current, nextCaret.current); nextCaret.current = null; }
  });

  const cons = Object.values(nodes).filter(isConsole);
  const ctx = { consoles: cons.map((c) => ({ name: c.name, agent: c.agentId })), groups: groups.map((g) => ({ name: groupTitle(g) })) };
  const m = mentionAt(text, caret);
  const items = m && dismissed !== text ? candidates(ctx, m.query) : [];
  const active = Math.min(sel, Math.max(0, items.length - 1));
  const empty = Object.keys(nodes).length === 0;

  const edit = (v: string, c: number) => { setText(v); setCaret(c); setSel(0); setDismissed(null); hist = { ...hist, pos: null }; };
  const pick = (t: (typeof items)[number]) => {
    const r = accept(text, caret, m!.start, t);
    setText(r.text); setCaret(r.caret); setSel(0); nextCaret.current = r.caret;
    input.current?.focus();
  };
  const send = () => {
    const txt = text.trim();
    if (!txt) return;
    hist = push(hist, txt);
    edit("", 0);
    const only = mentionOnly(txt, ctx);
    if (only) { // S-551
      const th = useThread.getState();
      th.add(repo, mk("user", txt));
      th.add(repo, mk("bot", t("Say what {name} should do", { name: only })));
    } else submit(txt, { repo, wsId });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isImeEvent(e)) return; // 한글 조합 중의 Enter·방향키는 입력기 몫
    if (items.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); return setSel((active + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length); }
      if (e.key === "Tab" || e.key === "Enter") { e.preventDefault(); return pick(items[active]!); }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); return setDismissed(text); }
    }
    if (e.key === "Enter") { e.preventDefault(); return send(); }
    if (e.key === "Escape") { e.preventDefault(); return input.current?.blur(); } // 키보드를 보드에 돌려준다
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const r = e.key === "ArrowUp" ? up(hist, text) : down(hist);
      hist = r.h;
      if (r.text !== null) { setText(r.text); setCaret(r.text.length); nextCaret.current = r.text.length; }
    }
  };

  return (
    <div style={{ position: "fixed", left: "50%", bottom: 16, transform: "translateX(-50%)", width: "min(640px, calc(100vw - 340px))", zIndex: 900, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
      {open && <ThreadPanel repo={repo} />}
      <div data-testid="command-bar" onPointerDown={(e) => e.stopPropagation()}
        style={{ pointerEvents: "auto", position: "relative", display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", background: "var(--surface)", color: "var(--fg-2)", border: `1px solid ${focused ? "var(--accent)" : "var(--bd)"}`, borderRadius: 22, boxShadow: "0 8px 28px var(--scrim)" }}>
        {ready && !hintOff && (
          <div data-testid="bar-hint" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", font: "12px system-ui", color: "var(--mute)", padding: "0 4px" }}>
            <span>{t("Try")} "<button data-testid="hint-example" onClick={() => { edit(hintExample(), hintExample().length); nextCaret.current = hintExample().length; input.current?.focus(); }} style={{ background: "none", border: 0, padding: 0, color: "inherit", font: "inherit", cursor: "pointer" }}>{hintExample()}</button>"</span>
            <button data-testid="hint-close" aria-label={t("Dismiss hint")} onClick={() => useSettings.getState().patch({ barHintDismissed: true })} style={{ background: "none", border: 0, color: "inherit", cursor: "pointer", font: "14px system-ui" }}>×</button>
          </div>
        )}
        <Chips wsId={wsId} repo={repo} threadOpen={open} />
        <BarNotice />
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
          {items.length > 0 && <MentionMenu items={items} active={active} onPick={pick} />}
          <span data-testid="bar-orb" data-state={orbState} aria-hidden style={circle("var(--voice-orb)")} />
          <ListeningBar />
          <input ref={input} data-testid="bar-input" value={text} spellCheck={false} autoComplete="off"
            placeholder={empty ? t("what can you do?") : t("Hold space to speak · @ to direct")}
            onChange={(e) => edit(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
            onKeyDown={onKeyDown} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: 0, color: "inherit", font: "14px system-ui", display: listening ? "none" : undefined }} />
          <button data-testid="thread-toggle" aria-label={t("Thread")} aria-expanded={open} onClick={() => useThread.getState().setOpen(!open)}
            style={{ ...circle("var(--surface-2)"), cursor: "pointer", transform: open ? "rotate(180deg)" : undefined }}>∧</button>
          <button data-testid="bar-mic" aria-label={t("Speak")} data-listening={listening || undefined} onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); micDown(); }} onPointerUp={micUp} onPointerCancel={micUp}
            style={{ ...circle(listening ? "var(--voice-rec)" : "var(--surface-2)"), cursor: "pointer", touchAction: "none" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg></button>
          <button data-testid="bar-send" aria-label={t("Send")} disabled={!text.trim()} onClick={send}
            style={{ ...circle(text.trim() ? "var(--accent)" : "var(--surface-2)"), color: text.trim() ? "var(--accent-text)" : "var(--fg)", cursor: text.trim() ? "pointer" : "default", opacity: text.trim() ? 1 : 0.6 }}>↑</button>
        </div>
      </div>
    </div>
  );
}
