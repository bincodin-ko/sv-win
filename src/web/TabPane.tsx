// 탭 하나의 본문: 시작 탭이면 다이얼, 주소가 있으면 연결 확인(web_probe) → 서버 대기(S-1109) / 임베드 불가(S-1110) / iframe.
// 활성이 아닌 탭도 DOM 에 남겨 숨긴다(S-1107).
import { useEffect, useRef, useState } from "react";
import { useScope } from "../board/BoardScope";
import { openUrl, webProbe, webWindowOpen } from "../lib/ipc";
import Dial from "./Dial";
import { fitDevice } from "./devices";
import { isLocalUrl, nextDelay, onProbe, type Wait } from "./waitState";
import { zoomBox } from "./zoom";
import { useT } from "../i18n";

export type Cmd = { kind: "reload" | "stop"; n: number };
type Phase = "probing" | "blocked" | Wait["phase"];
const btn: React.CSSProperties = { padding: "5px 12px", border: "1px solid var(--bd-2)", borderRadius: 6, background: "var(--panel-2)", color: "var(--fg)", font: "12px system-ui", cursor: "pointer" };
const center: React.CSSProperties = { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 24, textAlign: "center", color: "var(--fg-2)", font: "13px system-ui" };

export default function TabPane({ nodeId, tab, active, avail, device, zoom, cmd, covered, onCover, onLoading, onOpen }: {
  nodeId: string; tab: { id: string; url: string }; active: boolean; avail: { w: number; h: number };
  device: { w: number; h: number } | null; zoom: number; cmd?: Cmd; covered: boolean;
  onCover: () => void; onLoading: (tabId: string, loading: boolean) => void; onOpen: (url: string) => void;
}) {
  const t = useT();
  const url = tab.url;
  const { visible } = useScope();
  const vis = useRef(visible); // S-1102: 숨은 워크스페이스에서는 폴링·재시도를 쉰다
  vis.current = visible;
  const [phase, setPhase] = useState<Phase>("probing");
  const [retry, setRetry] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [loading, setLoading] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  // 연결 확인 + 서버 대기. 주소·Retry 가 바뀔 때마다 처음부터
  useEffect(() => {
    setStopped(false);
    if (!url) return;
    let dead = false, timer: ReturnType<typeof setTimeout> | undefined;
    let w: Wait | null = null;
    const local = isLocalUrl(url);
    setPhase("probing");
    const step = async () => {
      const t0 = Date.now();
      if (!vis.current) return void (timer = setTimeout(step, 1000));
      let r;
      try { r = await webProbe(url); } catch { r = null; } // 헤더를 못 읽으면 그냥 iframe 을 시도(S-1110)
      if (dead) return;
      if (!r) return setPhase("ready");
      if (r.reachable && r.frameBlocked) return setPhase("blocked");
      w = onProbe(w, r.reachable, local);
      setPhase(w.phase);
      if (w.phase === "waiting") timer = setTimeout(step, nextDelay(t0, Date.now()));
    };
    void step();
    return () => { dead = true; clearTimeout(timer); };
  }, [url, retry]);

  // 툴바 명령: Reload·Stop (S-1105)
  const last = useRef(cmd?.n);
  const st = useRef({ phase, stopped });
  st.current = { phase, stopped };
  useEffect(() => {
    if (!cmd || cmd.n === last.current) return;
    last.current = cmd.n;
    if (cmd.kind === "stop") { setStopped(true); setLoading(false); return; }
    if (st.current.phase !== "ready") return setRetry((r) => r + 1);
    setStopped(false);
    setLoading(true);
    const el = frameRef.current;
    if (el && !st.current.stopped) el.src = el.getAttribute("src")!; // 같은 주소를 다시 불러온다
  }, [cmd]);

  const src = stopped ? "about:blank" : url;
  useEffect(() => { if (phase === "ready") setLoading(!stopped); }, [phase, src, stopped]);
  useEffect(() => { onLoading(tab.id, loading); }, [loading, tab.id, onLoading]);

  const base = device ?? avail;
  const fit = device ? fitDevice(device, avail) : { scale: 1, left: 0, top: 0 };
  const z = zoomBox(zoom, base);
  return (
    <div data-testid="web-pane" data-tab-id={tab.id} style={{ position: "absolute", inset: 0, display: active ? "block" : "none" }}>
      {!url && <Dial live={active && visible} onOpen={onOpen} />}
      {url && phase === "ready" && (
        <>
          <div style={{ position: "absolute", left: fit.left, top: fit.top, width: base.w, height: base.h, transform: `scale(${fit.scale})`, transformOrigin: "0 0" }}>
            <iframe ref={frameRef} data-testid="web-frame" data-tab-id={tab.id} data-active={active} src={src} title={url}
              sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"
              onLoad={() => setLoading(false)}
              style={{ display: "block", border: 0, width: z.w, height: z.h, transform: `scale(${z.scale})`, transformOrigin: "0 0", background: "Canvas", colorScheme: "light" }} />
          </div>
          {covered && <div data-testid="web-cover" onPointerDown={onCover} style={{ position: "absolute", inset: 0, zIndex: 2 }} />}
        </>
      )}
      {url && phase === "probing" && <div style={center}><span style={{ color: "var(--mute)" }}>{t("Loading…")}</span></div>}
      {url && phase === "waiting" && (
        <div data-testid="web-waiting" style={center}>
          <div>{t("Waiting for the dev server")}</div>
          <div style={{ color: "var(--mute)", wordBreak: "break-all" }}>{url}</div>
          <button data-testid="web-retry-now" style={btn} onClick={() => setRetry((r) => r + 1)}>{t("Retry now")}</button>
        </div>
      )}
      {url && phase === "failed" && (
        <div data-testid="web-failed" style={center}>
          <div style={{ font: "600 14px system-ui", color: "var(--fg)" }}>{t("Couldn't load this page")}</div>
          <div style={{ color: "var(--mute)", wordBreak: "break-all" }}>{url}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button data-testid="web-retry" style={btn} onClick={() => setRetry((r) => r + 1)}>{t("Retry")}</button>
            <button data-testid="web-open-browser" style={btn} onClick={() => void openUrl(url).catch(() => {})}>{t("Open in Browser")}</button>
          </div>
        </div>
      )}
      {url && phase === "blocked" && (
        <div data-testid="web-blocked" style={center}>
          <div>{t("This site doesn't allow being shown inside a tile.")}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button data-testid="web-open-window" style={btn} onClick={() => void webWindowOpen(nodeId, url).catch(() => {})}>{t("Open in window")}</button>
            <button data-testid="web-open-browser2" style={btn} onClick={() => void openUrl(url).catch(() => {})}>{t("Open in Browser")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
