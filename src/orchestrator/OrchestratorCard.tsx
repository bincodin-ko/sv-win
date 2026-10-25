// S-1250~S-1266: Orchestrator 카드 본체 — 머리(이름·Connect/Done)·보조줄·카운터·행 목록·입력.
// 행 그리기는 Rows.tsx, 순수 규칙은 rows.ts·scope.ts·add.ts.
import { useEffect, useRef, useState } from "react";
import { tp, useT } from "../i18n";
import { agentsList, defaultAgent } from "../agents/api";
import { useScope } from "../board/BoardScope";
import { CONSOLE_H, CONSOLE_W, isConsole, type BoardNode } from "../board/store";
import { findSpot } from "../board/placement";
import { wiredTargets } from "../board/wired";
import { accept, candidates, mentionAt } from "../commandbar/mention";
import MentionMenu from "../commandbar/MentionMenu";
import { submit } from "../commandbar/executor";
import { useThread } from "../commandbar/thread";
import { getSession } from "../console/session";
import { getRepoPath } from "../console/offers";
import type { Status } from "../console/status";
import { useUi } from "../ui/useUi";
import RowList from "./RowList";
import { buildSections, counterText, headerText } from "./rows";
import { scopeOf } from "./scope";

const NAME_MAX = 24;
const dot: React.CSSProperties = { width: 8, height: 8, borderRadius: 4, background: "var(--accent)", flex: "none" };

export default function OrchestratorCard({ id }: { id: string }) {
  const t = useT();
  const { wsId, store } = useScope();
  const node = store((s) => s.nodes[id]) as BoardNode | undefined;
  const nodes = store((s) => s.nodes);
  const groups = store((s) => s.groups);
  const connecting = useUi((s) => s.connect?.cardId === id && s.connect.wsId === wsId);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 400); return () => clearInterval(t); }, []); // 상태 반영 0.5초 안(S-1255)
  const [agents, setAgents] = useState<Record<string, string>>({});
  useEffect(() => void agentsList().then((l) => setAgents(Object.fromEntries(l.map((a) => [a.id, a.name])))), []);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [sel, setSel] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const repo = getRepoPath(wsId) ?? "";
  const reply = useThread((s) => (sentAt ? s.byRepo[repo]?.filter((m) => m.role === "bot" && m.at >= sentAt).at(-1)?.text : undefined));
  if (!node) return null;

  const info = (cid: string) => ({ status: (getSession(wsId, cid)?.status() ?? "IDLE") as Status, agentName: agents[String(nodes[cid]?.agentId)] ?? String(nodes[cid]?.agentId ?? "") });
  const sections = buildSections(nodes, groups, node, info);
  const tw = wiredTargets(nodes, groups, node);
  const n = tw.consoles.length;
  const rows = sections.flatMap((s) => s.rows);
  const groupNames = tw.groups.map((g) => groups.find((x) => x.id === g)!.name);
  const patch = (p: Partial<BoardNode>) => store.getState().updateNode(id, p);

  const toggleConnect = () => useUi.setState({ connect: connecting ? null : { wsId, cardId: id } });
  const spawn = async () => {
    const s = store.getState();
    const agent = s.armedAgent ?? (await defaultAgent());
    const at = findSpot({ x: node.x + node.w + 40, y: node.y }, { w: CONSOLE_W, h: CONSOLE_H }, Object.values(store.getState().nodes));
    const cid = s.spawnConsole(agent, at);
    store.getState().toggleWired(id, cid, true); // 놓기와 연결이 되돌리기 한 단계
  };

  const ctx = { consoles: tw.consoles.flatMap((c) => (isConsole(nodes[c]) ? [{ name: String(nodes[c]!.name), agent: String(nodes[c]!.agentId) }] : [])), groups: groupNames.map((name) => ({ name })) };
  const m = mentionAt(text, caret);
  const items = m && dismissed !== text ? candidates(ctx, m.query) : [];
  const active = Math.min(sel, Math.max(0, items.length - 1));
  const edit = (v: string, c: number) => { setText(v); setCaret(c); setSel(0); setDismissed(null); };
  const pick = (it: (typeof items)[number]) => { const r = accept(text, caret, m!.start, it); edit(r.text, r.caret); setTimeout(() => input.current?.setSelectionRange(r.caret, r.caret)); };
  const send = () => {
    const v = text.trim();
    if (!v) return;
    edit("", 0);
    const at = Date.now();
    setSentAt(at);
    patch({ lastOrder: { text: v.slice(0, 600), at } }); // Mission Map 이 읽는다(S-1309)
    submit(v, { repo, wsId, scope: scopeOf(wsId, nodes, groups, node) });
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.nativeEvent.isComposing) return;
    if (items.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); return setSel((active + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length); }
      if (e.key === "Tab" || e.key === "Enter") { e.preventDefault(); return pick(items[active]!); }
      if (e.key === "Escape") { e.preventDefault(); return setDismissed(text); }
    }
    if (e.key === "Enter") { e.preventDefault(); send(); }
    else if (e.key === "Escape") { e.preventDefault(); edit("", 0); }
  };

  return (
    <div data-testid="orch-card" data-id={id} style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "var(--surface)", border: "1px solid var(--bd)", borderRadius: 14, color: "var(--fg-2)", font: "12px system-ui" }}>
      <div data-node-handle style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 12px", cursor: "grab", userSelect: "none" }}>
        <span style={dot} />
        {editing ? (
          <input data-testid="orch-name-input" autoFocus maxLength={NAME_MAX} defaultValue={String(node.name)} onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditing(false); }}
            onBlur={(e) => { const v = e.currentTarget.value.trim().slice(0, NAME_MAX); if (v) patch({ name: v }); setEditing(false); }}
            style={{ flex: 1, minWidth: 0, font: "600 13px system-ui" }} />
        ) : (
          <span data-testid="orch-name" onDoubleClick={() => setEditing(true)} style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", font: "600 13px system-ui", color: "var(--fg)" }}>{String(node.name)}</span>
        )}
        <button data-testid="orch-toggle" onClick={toggleConnect} onPointerDown={(e) => e.stopPropagation()}
          style={{ padding: "3px 12px", borderRadius: 999, font: "600 11px system-ui", cursor: "pointer", border: "1px solid var(--accent)", background: connecting ? "var(--accent)" : "transparent", color: connecting ? "var(--accent-text)" : "var(--accent)" }}>
          {connecting ? t("Done") : t("Connect")}
        </button>
      </div>
      <div style={{ flex: "none", display: "flex", justifyContent: "space-between", padding: "0 12px 8px", color: "var(--fg-4)" }}>
        <span data-testid="orch-sub">{headerText(n, groupNames)}</span>
        <span data-testid="orch-count">{counterText(rows.map((r) => r.status))}</span>
      </div>
      <div data-testid="orch-rows" data-wheel-own style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 8px 8px", display: "flex", flexDirection: "column", rowGap: 6 }}>
        {rows.length === 0 ? (
          <div data-testid="orch-empty" style={{ margin: "auto", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <span style={{ color: "var(--fg-4)" }}>{t("No agents wired")}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button data-testid="orch-empty-connect" onClick={toggleConnect} style={{ padding: "4px 12px", borderRadius: 999, border: "1px solid var(--accent)", background: "transparent", color: "var(--accent)", cursor: "pointer" }}>{t("+ Connect")}</button>
              <button data-testid="orch-spawn" onClick={() => void spawn()} style={{ padding: "4px 12px", borderRadius: 999, border: "1px solid var(--bd)", background: "transparent", color: "inherit", cursor: "pointer" }}>{t("Spawn agent")}</button>
            </div>
          </div>
        ) : (
          <RowList cardId={id} sections={sections} />
        )}
      </div>
      <div style={{ flex: "none", position: "relative", padding: 8, borderTop: "1px solid var(--bd)" }}>
        {items.length > 0 && <MentionMenu items={items} active={active} onPick={pick} />}
        {sentAt > 0 && reply && <div data-testid="orch-reply" style={{ padding: "0 4px 6px", color: "var(--fg-4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{reply}</div>}
        <input ref={input} data-testid="orch-input" value={text} disabled={n === 0} onPointerDown={(e) => e.stopPropagation()}
          placeholder={n === 0 ? t("Wire an agent to give orders") : tp("Command {n} agent · @ to direct…", "Command {n} agents · @ to direct…", n)}
          onChange={(e) => edit(e.target.value, e.target.selectionStart ?? e.target.value.length)}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)} onKeyDown={onKeyDown}
          style={{ width: "100%", boxSizing: "border-box", padding: "6px 10px", borderRadius: 8, border: "1px solid var(--bd)", background: "var(--surface-2)", color: "var(--fg)", font: "12px system-ui" }} />
      </div>
    </div>
  );
}
