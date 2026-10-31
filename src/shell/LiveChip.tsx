// S-338: 열린 모든 워크스페이스의 실행 중 콘솔 수. 0이면 숨김.
// 167번: 누르면 실행 중 CLI 목록 — 줄마다 보기·끄기(CLI 만 종료, 칸은 남음)·닫기(종료 + 칸 삭제), 맨 아래 모두 끄기
import { useEffect, useState } from "react";
import { DEFAULT_SCOPE, registry } from "../board/boards";
import { isConsole } from "../board/store";
import { confirmClose } from "../console/ConfirmClose";
import { requestClose, runningCount, runningSessions } from "../console/session";
import { statusLabel } from "../board/statusLabel";
import { useT } from "../i18n";
import { Menu, MenuHeader } from "./Menu";
import { jumpTo } from "./needsYou";
import { useShell } from "./useShell";

const scopeOf = (wsId: string) => (wsId ? { wsId, store: registry.get(wsId) ?? DEFAULT_SCOPE.store } : DEFAULT_SCOPE);
const nodeName = (wsId: string, id: string) => { const n = scopeOf(wsId).store.getState().nodes[id]; return isConsole(n) ? n.name : id; };
const small = { border: "1px solid var(--border)", borderRadius: 6, background: "var(--panel-2)", color: "var(--text)", font: "12px system-ui", padding: "2px 8px", cursor: "pointer" } as const;

export default function LiveChip() {
  const t = useT();
  const [n, setN] = useState(0);
  const repos = useShell((s) => s.openRepos);
  // ponytail: 0.5초마다 읽는다. 세션 목록이 변경 알림을 내면 구독으로 바꾼다
  useEffect(() => {
    const iv = setInterval(() => setN(runningCount()), 500);
    setN(runningCount());
    return () => clearInterval(iv);
  }, []);
  if (n < 1) return null;
  const wsName = (wsId: string) => repos.flatMap((r) => r.workspaces).find((w) => w.id === wsId)?.name ?? "";
  const rows = () => runningSessions().map(({ key, s }) => {
    const [wsId, id] = JSON.parse(key) as [string, string];
    return { key, s, wsId, id, name: nodeName(wsId, id), ws: wsName(wsId) };
  });
  return (
    <Menu testId="live-chip" label={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--ok)" }} />{t("{n} live", { n })}</span>}>
      {(close) => {
        const list = rows();
        return (
          <div data-testid="live-list" style={{ display: "grid", gap: 2, minWidth: 320 }}>
            <MenuHeader>{t("Running CLIs")}</MenuHeader>
            {list.map((r) => (
              <div key={r.key} data-testid="live-row" style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px" }}>
                <button role="menuitem" data-testid="live-go" title={t("Show")} onClick={() => { close(); jumpTo(r.key); }}
                  style={{ flex: 1, minWidth: 0, textAlign: "left", border: 0, background: "transparent", color: "var(--text)", font: "13px system-ui", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.name}<span style={{ color: "var(--text-dim)", font: "11px system-ui" }}>{r.ws ? ` · ${r.ws}` : ""} · {statusLabel(r.s.status())}</span>
                </button>
                <button data-testid="live-stop" title={t("Stop the CLI (the console stays)")} onClick={() => r.s.kill()} style={small}>{t("Stop CLI")}</button>
                <button data-testid="live-close" title={t("Stop and remove the console")} onClick={() => { close(); void requestClose([r.id], scopeOf(r.wsId)); }} style={small}>{t("Close")}</button>
              </div>
            ))}
            <button data-testid="live-stop-all" onClick={async () => {
              const all = rows();
              close();
              if (all.length && (await confirmClose(all.map((r) => r.name)))) all.forEach((r) => r.s.kill());
            }} style={{ ...small, margin: "4px 6px", padding: "4px 8px" }}>{t("Stop all")}</button>
          </div>
        );
      }}
    </Menu>
  );
}
