// S-1370·S-1371·S-1374·S-1375: Memory 카드 — 머리줄 · 사실 수 · Wire/Done · Push · Open memory · 결과 줄 · wired to N
import { useEffect, useState } from "react";
import { useScope } from "../board/BoardScope";
import { wiredTargets } from "../board/wired";
import { useT } from "../i18n";
import { useShell } from "../shell/useShell";
import { useUi } from "../ui/useUi";
import { repoName } from "./facts";
import { pushLine, pushMemory, type PushResult } from "./push";
import { useMemory } from "./useMemory";

const b: React.CSSProperties = { cursor: "pointer", padding: "3px 10px", borderRadius: 6, border: "1px solid var(--bd)", background: "none", color: "var(--fg-2)", font: "600 12px system-ui" };

export default function MemoryCard({ id }: { id: string }) {
  const t = useT();
  const { store, wsId } = useScope();
  const n = store((s) => s.nodes[id]) as unknown as { wired?: string[]; lastPush?: PushResult } | undefined;
  const wired = store((s) => (s.nodes[id] ? wiredTargets(s.nodes, s.groups, s.nodes[id]).consoles.length : 0));
  const repo = useShell((s) => s.openRepos.find((r) => r.workspaces.some((w) => w.id === wsId))?.path ?? null);
  const connecting = useUi((s) => s.connect?.cardId === id && s.connect.wsId === wsId);
  const count = useMemory((s) => (repo ? s.data[repo]?.length ?? 0 : 0) + (s.data._all?.length ?? 0));
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!useMemory.getState().data[repo ?? "_all"]) void useMemory.getState().load(repo); }, [repo]);
  if (!n) return null;
  const tip = t("Push again when you add agents.");
  const push = async () => { setBusy(true); try { await pushMemory(store, wsId, id); } finally { setBusy(false); } };
  return (
    <div data-testid="memory-card" data-id={id} title={tip} style={{ width: "100%", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", background: "var(--surface)", border: "1px solid var(--bd)", borderRadius: 10, overflow: "hidden", font: "12px system-ui", color: "var(--fg-2)" }}>
      <div data-node-handle style={{ flex: "none", padding: "6px 10px", borderBottom: "1px solid var(--bd)" }}>
        <b data-testid="memory-card-title" style={{ color: "var(--violet)" }}>{t("Project memory")}</b>
        <div data-testid="memory-card-sub" style={{ color: "var(--mute)" }}>{repo ? repoName(repo) : t("All repos")} · {t("{n} facts", { n: count })}</div>
      </div>
      <div style={{ flex: 1, padding: 10, display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button data-testid="memory-card-wire" onClick={() => useUi.setState({ connect: connecting ? null : { wsId, cardId: id } })} style={{ ...b, ...(connecting ? { borderColor: "var(--violet)", color: "var(--violet)" } : {}) }}>{connecting ? t("Done") : t("Wire")}</button>
          <button data-testid="memory-card-push" title={tip} disabled={count === 0 || busy} onClick={() => void push()} style={{ ...b, opacity: count === 0 ? 0.4 : 1 }}>{t("Push")}</button>
          <button data-testid="memory-card-open" onClick={() => useUi.getState().openMemory()} style={b}>{t("Open memory")}</button>
        </div>
        {n.lastPush && <div data-testid="memory-card-result" style={{ color: "var(--text-dim)" }}>{pushLine(n.lastPush)}</div>}
        <div data-testid="memory-card-wired" style={{ color: "var(--mute)", marginTop: "auto" }}>{t("wired to {n}", { n: wired })}</div>
      </div>
    </div>
  );
}
