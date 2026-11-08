// 바깥 Claude 가져오기: Symvibe 밖(바탕화면 터미널 등)에서 돌고 있는 Claude 가 있으면 위 막대에 칩. 고르면 묻고 그 Claude 를 끈 뒤
// 지금 보드에 같은 대화(--resume)로 연다. 두 곳에서 같은 대화를 쓰면 기록이 엉키므로 바깥 것을 끈다(사용자 선택: 묻고 끄기)
import { useEffect, useState } from "react";
import { placeConversation } from "../conversations/place";
import { outsideClaudes, outsideClaudeStop, type OutsideClaude } from "../lib/ipc";
import { confirmDialog } from "../ui/ConfirmDialog";
import { useT } from "../i18n";
import { Menu, MenuHeader } from "./Menu";

const POLL_MS = 5000;
const folder = (p: string) => p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || p;

export async function bringIn(o: OutsideClaude, t: (k: string, v?: Record<string, string | number>) => string): Promise<boolean> {
  const ok = await confirmDialog({ title: t("Bring this Claude into Symvibe?"), message: t("The Claude running outside ({folder}) will be closed and the same conversation opens here.", { folder: folder(o.cwd) }), confirmLabel: t("Bring in") });
  if (!ok) return false;
  await outsideClaudeStop(o.pid, o.sessionId).catch(() => {});
  await placeConversation({ cli: "claude", sessionId: o.sessionId, cwd: o.cwd, cwdExists: true, title: o.last, firstPrompt: o.last, lastAt: o.startedAt, messages: 0, profile: null });
  return true;
}

export default function OutsideChip() {
  const t = useT();
  const [list, setList] = useState<OutsideClaude[]>([]);
  useEffect(() => {
    let dead = false;
    const tick = () => void outsideClaudes().then((l) => !dead && setList(l), () => {});
    tick();
    const iv = setInterval(() => document.visibilityState === "visible" && tick(), POLL_MS);
    return () => { dead = true; clearInterval(iv); };
  }, []);
  if (!list.length) return null;
  return (
    <Menu testId="outside-chip" label={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--warn-2)" }} />{t("{n} outside", { n: list.length })}</span>}>
      {(close) => (
        <div data-testid="outside-list" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2, width: 360, maxWidth: "calc(100vw - 32px)" }}>
          <MenuHeader>{t("Claude running outside Symvibe")}</MenuHeader>
          {list.map((o) => (
            <div key={o.pid} data-testid="outside-row" style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px", minWidth: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: "13px system-ui", color: "var(--text)" }}>{folder(o.cwd)}</div>
                <div style={{ font: "11px system-ui", color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.last || t("(no messages yet)")}</div>
              </div>
              <button data-testid="outside-bring" role="menuitem" onClick={() => { close(); void bringIn(o, t).then((ok) => ok && setList((l) => l.filter((x) => x.pid !== o.pid))); }}
                style={{ border: "1px solid var(--border)", borderRadius: 6, background: "var(--panel-2)", color: "var(--text)", font: "12px system-ui", padding: "2px 8px", cursor: "pointer", whiteSpace: "nowrap" }}>{t("Bring in")}</button>
            </div>
          ))}
        </div>
      )}
    </Menu>
  );
}
