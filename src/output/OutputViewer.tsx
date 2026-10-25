// B15 S-663~S-667: 모달 viewer — 답 전체를 문서처럼(줄바꿈 유지, 코드 블록 고정폭). Copy · Save .md · Reply to <이름> · Esc
import { useEffect, useRef, useState } from "react";
import { agentsList } from "../agents/api";
import { getStore } from "../board/boards";
import { isConsole } from "../board/store";
import { getRepoPath } from "../console/offers";
import { sessionKey } from "../console/sessionKey";
import { getSession } from "../console/session";
import { typeAndSubmit } from "../console/submit";
import { outputsSave } from "../lib/ipc";
import { savedStamps, splitBlocks } from "./reply";
import { setReply, useOutputs } from "./useOutputs";
import { useT } from "../i18n";

const btn: React.CSSProperties = { background: "var(--panel-2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 12px", font: "12px system-ui", cursor: "pointer" };

export default function OutputViewer({ wsId, nodeId, onClose }: { wsId: string; nodeId: string; onClose: () => void }) {
  const t = useT();
  const node = getStore(wsId).getState().nodes[nodeId];
  const name = isConsole(node) ? node.name : nodeId;
  const agentId = isConsole(node) ? node.agentId : "shell";
  const reply = useOutputs((s) => s.replies[sessionKey(wsId, nodeId)]);
  const [agentName, setAgentName] = useState(agentId);
  const [saved, setSaved] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [text, setText] = useState("");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => void agentsList().then((l) => setAgentName(l.find((a) => a.id === agentId)?.name ?? agentId)), [agentId]);
  // 아이콘 없이 열렸고(스레드 행 등) 아직 답을 안 가져왔으면 지금 가져온다
  useEffect(() => {
    if (reply === undefined) void getSession(wsId, nodeId)?.fetchReply().then((t) => t && setReply(wsId, nodeId, t));
  }, [wsId, nodeId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    root.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const body = reply ?? "";
  const copy = () => void navigator.clipboard.writeText(body).then(() => setNote(t("Copied")), () => setNote(t("Copy failed")));
  const save = async () => {
    const repo = getRepoPath(wsId);
    if (!repo) return setNote(t("No repo folder to save in"));
    const { header, stamp } = savedStamps(new Date(), name, agentName);
    try {
      setSaved(await outputsSave(repo, name, stamp, `${header}\n\n${body}\n`));
    } catch (e) {
      setNote(t("Save failed: {error}", { error: String(e) }));
    }
  };
  const send = () => {
    const s = getSession(wsId, nodeId);
    const msg = text.trim();
    if (!s || !msg) return;
    setText("");
    void typeAndSubmit(s, msg);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 16000, display: "grid", placeItems: "center", background: "var(--scrim)" }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={root} tabIndex={-1} role="dialog" aria-label={t("{name} output", { name })} data-testid="output-viewer"
        style={{ width: "min(760px, 92vw)", maxHeight: "86vh", display: "flex", flexDirection: "column", background: "var(--panel)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 12px 40px var(--scrim-50)", outline: "none", font: "13px system-ui" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
          <b>{name}</b>
          <span style={{ color: "var(--text-dim)" }}>({agentName})</span>
          <span style={{ flex: 1 }} />
          <span data-testid="output-note" style={{ color: "var(--text-dim)", fontSize: 12 }}>{note}</span>
          <button data-testid="output-copy" style={btn} onClick={copy}>{t("Copy")}</button>
          <button data-testid="output-save" style={btn} onClick={() => void save()}>{t("Save .md")}</button>
          <button data-testid="output-close" aria-label={t("Close")} title={t("Close (Esc)")} style={btn} onClick={onClose}>✕</button>
        </div>
        {saved && <div data-testid="output-saved" style={{ padding: "6px 14px", color: "var(--ok)", fontSize: 12, wordBreak: "break-all" }}>{t("Saved to {path}", { path: saved })}</div>}
        <div data-testid="output-text" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "12px 16px", whiteSpace: "pre-wrap", lineHeight: 1.55, userSelect: "text" }}>
          {reply === undefined ? <span style={{ color: "var(--text-dim)" }}>{t("No output yet.")}</span> : splitBlocks(body).map((b, i) =>
            b.code
              ? <pre key={i} data-testid="output-code" style={{ margin: "8px 0", padding: "8px 10px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 6, fontFamily: "Consolas, 'Courier New', monospace", fontSize: 12, whiteSpace: "pre-wrap", overflowX: "auto" }}>{b.text}</pre>
              : <div key={i}>{b.text}</div>)}
        </div>
        <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderTop: "1px solid var(--border)" }}>
          <input data-testid="output-reply-input" value={text} placeholder={t("Reply to {name}", { name })} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && !e.nativeEvent.isComposing) send(); }}
            style={{ flex: 1, background: "var(--panel-2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 8px", font: "inherit" }} />
          <button data-testid="output-reply-send" style={{ ...btn, background: "var(--accent)", color: "var(--accent-text)", border: 0 }} onClick={send}>{t("Reply to {name}", { name })}</button>
        </div>
      </div>
    </div>
  );
}
