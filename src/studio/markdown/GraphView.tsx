// 5묶음 E5 S-1935·S-1936: 그래프 그리기·조작. 어두운 바탕에 얇은 회색 선, 열린 글과 이웃은 주황 점·나머지는 흰 점(4~9px), 올리면 이름.
// 끌기 = 이동, 휠 = 눌린 자리 중심 확대·축소, 방향키 = 이동, + - = 확대·축소, 0 = 모두 보이게. 이 컴포넌트는 Graph 탭이 보일 때만 그려지므로 키도 그때만 먹는다.
// ponytail: 점이 SVG 요소라 2,000개쯤까지는 부드럽다. 그 이상 늘리면 canvas 로 바꾼다.
import { useT } from "../../i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createLayout, type Graph, type Pos } from "./graph";

type View = { tx: number; ty: number; s: number };
const MIN_S = 0.05, MAX_S = 6;
const clampS = (s: number) => Math.min(MAX_S, Math.max(MIN_S, s));

export default function GraphView({ graph, openPath, onOpen }: { graph: Graph; openPath: string; onOpen: (path: string) => void }) {
  const t = useT();
  const box = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [spacing, setSpacing] = useState(1);
  const [pos, setPos] = useState<Pos>({});
  const [view, setView] = useState<View>({ tx: 0, ty: 0, s: 1 });
  const [hover, setHover] = useState<string | null>(null);
  const viewRef = useRef(view); viewRef.current = view;
  const sizeRef = useRef(size); sizeRef.current = size;
  const posRef = useRef(pos); posRef.current = pos;
  const fitted = useRef<Graph | null>(null);

  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 800, h: el.clientHeight || 500 }));
    ro.observe(el);
    setSize({ w: el.clientWidth || 800, h: el.clientHeight || 500 });
    return () => ro.disconnect();
  }, []);

  const fit = useCallback((p: Pos = posRef.current) => {
    const pts = Object.values(p), { w, h } = sizeRef.current;
    if (!pts.length) return setView({ tx: w / 2, ty: h / 2, s: 1 });
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const s = clampS(Math.min((w - 80) / Math.max(1, x1 - x0), (h - 80) / Math.max(1, y1 - y0), 2));
    setView({ s, tx: w / 2 - ((x0 + x1) / 2) * s, ty: h / 2 - ((y0 + y1) / 2) * s });
  }, []);

  // 배치는 조각으로 나눠 돌려 화면이 안 멈춘다(10번마다 한 번 쉬며 그린다)
  useEffect(() => {
    const l = createLayout(graph, spacing, 0);
    let dead = false, timer: ReturnType<typeof setTimeout>;
    const run = () => {
      if (dead) return;
      const done = l.step(10);
      const p = l.pos();
      setPos(p);
      if (done) { if (fitted.current !== graph) { fitted.current = graph; fit(p); } return; }
      timer = setTimeout(run, 0);
    };
    run();
    return () => { dead = true; clearTimeout(timer); };
  }, [graph, spacing, fit]);

  const zoomAt = (px: number, py: number, k: number) => setView((v) => {
    const s = clampS(v.s * k), r = s / v.s;
    return { s, tx: px - (px - v.tx) * r, ty: py - (py - v.ty) * r };
  });

  useEffect(() => {
    const el = box.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented || t?.closest("input,textarea,[contenteditable]")) return;
      const { w, h } = sizeRef.current;
      const pan = (dx: number, dy: number) => setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
      if (e.key === "+" || e.key === "=") zoomAt(w / 2, h / 2, 1.25);
      else if (e.key === "-" || e.key === "_") zoomAt(w / 2, h / 2, 0.8);
      else if (e.key === "0") fit();
      else if (e.key === "ArrowLeft") pan(40, 0);
      else if (e.key === "ArrowRight") pan(-40, 0);
      else if (e.key === "ArrowUp") pan(0, 40);
      else if (e.key === "ArrowDown") pan(0, -40);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => { el.removeEventListener("wheel", wheel); window.removeEventListener("keydown", key); };
  }, [fit]);

  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const hot = useMemo(() => {
    const s = new Set<string>([openPath]);
    for (const e of graph.edges) { if (e.a === openPath) s.add(e.b); if (e.b === openPath) s.add(e.a); }
    return openPath ? s : new Set<string>();
  }, [graph, openPath]);
  const P = (id: string) => { const q = pos[id]; return q ? { x: view.tx + q.x * view.s, y: view.ty + q.y * view.s } : null; };
  const named = hover ? graph.nodes.find((n) => n.id === hover) : null;
  const np = named ? P(named.id) : null;

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <svg ref={box} data-testid="md-graph" data-scale={view.s.toFixed(3)} tabIndex={0} role="img" aria-label={t("Markdown link graph")}
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, moved: false }; }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x, dy = e.clientY - d.y;
          if (!d.moved && Math.hypot(dx, dy) < 4) return;
          if (!d.moved) e.currentTarget.setPointerCapture?.(e.pointerId);
          d.moved = true; d.x = e.clientX; d.y = e.clientY;
          setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
        }}
        onPointerUp={() => setTimeout(() => (drag.current = null), 0)}
        style={{ flex: 1, minHeight: 0, width: "100%", background: "var(--studio-graph-bg)", cursor: "grab", outline: "none", touchAction: "none" }}>
        {graph.edges.map((e) => { const a = P(e.a), b = P(e.b); return a && b ? <line key={e.a + "|" + e.b} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--studio-graph-line)" strokeWidth={1} /> : null; })}
        {graph.nodes.map((n) => {
          const q = P(n.id);
          return q ? (
            <circle key={n.id} data-testid="gnode" data-path={n.id} cx={q.x} cy={q.y} r={Math.min(9, Math.max(4, 4 + n.degree))} style={{ cursor: "pointer" }}
              fill={hot.has(n.id) ? "var(--studio-graph-hot)" : "var(--studio-graph-node)"}
              onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover(null)}
              onClick={() => { if (!drag.current?.moved) onOpen(n.id); }}>
              <title>{n.name}</title>
            </circle>
          ) : null;
        })}
        {named && np && <text data-testid="gname" x={np.x + 12} y={np.y + 4} fill="var(--studio-graph-text)" fontSize={12} style={{ pointerEvents: "none" }}>{named.name}</text>}
      </svg>
      <label style={{ position: "absolute", right: 12, bottom: 10, display: "flex", alignItems: "center", gap: 6, color: "var(--studio-graph-text)", font: "12px system-ui" }}>
        {t("Spacing")}
        <input data-testid="md-spacing" type="range" min={0.5} max={2} step={0.1} value={spacing} onChange={(e) => setSpacing(Number(e.target.value))} />
      </label>
    </div>
  );
}
