// S-1102: 빈 시작 탭 — localhost 다이얼(6포트, 3초마다 점 갱신)과 빠른 링크 6개.
import { useEffect, useState } from "react";
import { webPorts } from "../lib/ipc";
import { useT } from "../i18n";

export const PORTS = [3000, 3001, 4200, 5173, 8000, 8080];
export const QUICK: [string, string][] = [
  ["Google", "https://google.com"], ["GitHub", "https://github.com"], ["YouTube", "https://youtube.com"],
  ["MDN", "https://developer.mozilla.org"], ["npm", "https://npmjs.com"], ["Hacker News", "https://news.ycombinator.com"],
];
const chip: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", border: "1px solid var(--bd)", borderRadius: 6, background: "var(--panel-2)", color: "var(--fg-2)", font: "12px system-ui", cursor: "pointer", textAlign: "left" };

export default function Dial({ live, onOpen }: { live: boolean; onOpen: (url: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState<boolean[]>(PORTS.map(() => false));
  useEffect(() => {
    if (!live) return;
    let dead = false;
    const poll = () => webPorts(PORTS).then((r) => !dead && setOpen(r), () => {});
    poll();
    const t = setInterval(poll, 3000);
    return () => { dead = true; clearInterval(t); };
  }, [live]);
  const h: React.CSSProperties = { font: "600 11px system-ui", color: "var(--mute)", letterSpacing: 0.5, margin: "0 0 6px" };
  return (
    <div data-testid="web-dial" style={{ position: "absolute", inset: 0, overflow: "auto", padding: 16, color: "var(--fg)" }} data-wheel-own>
      <p style={h}>{t("LOCALHOST")}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
        {PORTS.map((p, i) => (
          <button key={p} data-testid="web-port" data-port={p} data-open={open[i]} style={chip} onClick={() => onOpen(`http://localhost:${p}`)}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: open[i] ? "var(--ok)" : "var(--mute-3)", flex: "none" }} />
            <span>{p}</span>
          </button>
        ))}
      </div>
      <p style={h}>{t("QUICK LINKS")}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {QUICK.map(([name, u]) => <button key={name} data-testid="web-quick" style={chip} onClick={() => onOpen(u)}>{name}</button>)}
      </div>
    </div>
  );
}
