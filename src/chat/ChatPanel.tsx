// 대기열 1번: CLI 를 채팅처럼 보는 패널(콘솔 오른쪽에 붙음). 대화 기록 파일을 1.2초마다 이어 읽고, 아래 입력창은 CLI 로 보낸다.
import { useEffect, useRef, useState } from "react";
import { chatLines } from "../lib/ipc";
import type { Session } from "../console/session";
import { typeAndSubmit } from "../console/submit";
import { showsPrompt } from "../commandbar/prompts";
import { appendMsgs, lineToMsgs, promptOptions, type Msg } from "./parse";
import { useT } from "../i18n";

const POLL_MS = 1200;

export default function ChatPanel({ getSession, onClose }: { getSession: () => Session | undefined; onClose: () => void }) {
  const t = useT();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [prompt, setPrompt] = useState<{ lines: string[]; options: { label: string; keys: string }[] } | null>(null);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [text, setText] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const composing = useRef(false);

  useEffect(() => {
    let dead = false, from = 0, key = "", timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const s = getSession();
      const ref = s?.chatRef() ?? null;
      const k = ref ? `${ref.agent}:${ref.sessionId}` : "";
      if (k !== key) { key = k; from = 0; setMsgs([]); } // 새 대화(다시 시작·이어가기)면 처음부터
      if (ref) {
        const r = await chatLines(ref.agent, ref.repo, ref.sessionId, ref.configDir, from).catch(() => null);
        if (dead) return;
        if (r && r.lines.length) setMsgs((m) => appendMsgs(m, r.lines.flatMap((l) => lineToMsgs(ref.agent, l))));
        if (r) from = r.next;
      }
      const tail = s?.tail(14) ?? [];
      setPrompt(s?.isRunning() && showsPrompt(tail) ? { lines: tail.filter((l) => l.trim()).slice(-8), options: promptOptions(tail) } : null);
      timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => { dead = true; clearTimeout(timer); };
  }, [getSession]);

  // 맨 아래 근처에 있으면 새 메시지를 따라 내려간다
  useEffect(() => {
    const el = box.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight;
  }, [msgs, prompt]);

  const send = () => {
    const s = getSession(), v = text.trim();
    if (!s || !v || prompt) return; // 질문이 떠 있을 때 Enter 를 보내면 보기가 골라진다(설치본 실측: 폴더 신뢰에서 'No, exit' 가 골라져 Claude 가 꺼짐)
    setText("");
    void typeAndSubmit(s, v);
  };

  return (
    <div data-testid="chat-panel" onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}
      style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "var(--surface)", border: "1px solid var(--bd)", borderRadius: 10, color: "var(--fg)", font: "13px system-ui", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", height: 32, padding: "0 10px", borderBottom: "1px solid var(--bd)", color: "var(--fg-3)", flex: "none" }}>
        <span style={{ flex: 1, fontWeight: 600 }}>{t("Chat view")}</span>
        <button data-testid="chat-close" aria-label={t("Close")} title={t("Close")} onClick={onClose} style={{ border: 0, background: "none", color: "var(--mute)", cursor: "pointer", font: "13px system-ui" }}>✕</button>
      </div>
      <div ref={box} data-testid="chat-list" style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        {!msgs.length && <div data-testid="chat-empty" style={{ color: "var(--mute)", textAlign: "center", marginTop: 24 }}>{t("No conversation yet")}</div>}
        {msgs.map((m, i) =>
          m.role === "tools" ? (
            <div key={i} data-testid="chat-tools">
              <button onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))} style={{ border: 0, background: "none", padding: 0, color: "var(--mute)", font: "12px system-ui", cursor: "pointer" }}>
                {t("{n} tools used", { n: m.tools.length })} {open[i] ? "▾" : "▸"}
              </button>
              {open[i] && (
                <div style={{ marginTop: 4, padding: "6px 8px", borderRadius: 6, background: "var(--surface-2)", font: "12px ui-monospace, Consolas, monospace", color: "var(--fg-3)", display: "grid", gap: 2 }}>
                  {m.tools.map((x, j) => <div key={j} style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}><b>{x.name}</b> {x.detail}</div>)}
                </div>
              )}
            </div>
          ) : (
            <div key={i} data-testid={`chat-${m.role}`} style={m.role === "user"
              ? { alignSelf: "flex-end", maxWidth: "85%", padding: "8px 12px", borderRadius: 12, background: "var(--surface-2)", whiteSpace: "pre-wrap", wordBreak: "break-word" }
              : { alignSelf: "stretch", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.5 }}>{m.text}</div>
          ),
        )}
        {prompt && (
          <div data-testid="chat-prompt" style={{ border: "1px solid var(--accent)", borderRadius: 8, padding: 8, display: "grid", gap: 6 }}>
            <div style={{ font: "12px ui-monospace, Consolas, monospace", whiteSpace: "pre-wrap", color: "var(--fg-3)" }}>{prompt.lines.join("\n")}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {prompt.options.map((o, i) => (
                <button key={i} data-testid="chat-prompt-option" onClick={() => getSession()?.write(o.keys)}
                  style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid var(--bd-2)", background: "var(--surface-2)", color: "var(--fg)", font: "12px system-ui", cursor: "pointer" }}>{o.label}</button>
              ))}
              <button data-testid="chat-prompt-esc" onClick={() => getSession()?.write("\x1b")}
                style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid var(--bd-2)", background: "transparent", color: "var(--fg-3)", font: "12px system-ui", cursor: "pointer" }}>{t("Cancel")} (Esc)</button>
            </div>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, padding: 8, borderTop: "1px solid var(--bd)", flex: "none" }}>
        <textarea data-testid="chat-input" value={text} rows={2} disabled={!!prompt} placeholder={prompt ? t("Answer the question above first") : t("Message the CLI (Enter to send)")}
          onChange={(e) => setText(e.target.value)}
          onCompositionStart={() => (composing.current = true)} onCompositionEnd={() => (composing.current = false)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !composing.current && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
          style={{ flex: 1, resize: "none", padding: "6px 8px", borderRadius: 8, border: "1px solid var(--bd-2)", background: "var(--surface-2)", color: "var(--fg)", font: "13px system-ui" }} />
        <button data-testid="chat-send" onClick={send} aria-label={t("Send")} style={{ padding: "0 12px", borderRadius: 8, border: 0, background: "var(--accent)", color: "var(--accent-text)", font: "600 12px system-ui", cursor: "pointer" }}>↑</button>
      </div>
    </div>
  );
}
