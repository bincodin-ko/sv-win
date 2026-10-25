// S-823: 선·화살표. 선택하면 끝 노브 2개와 가운데 노브(곡선). 노드 상자 = 선의 경계 상자
import { useScope } from "../BoardScope";
import { inkVar } from "../ink-colors";
import { dashFor } from "./ShapeNode";
import { linePath, strokePx, type P } from "./rough";
import { bendFromMid, curveMid, normalizeLine, snapAngle } from "./snap";

export default function LineNode({ id }: { id: string }) {
  const { store } = useScope();
  const n = store((s) => s.nodes[id]) as Record<string, any> | undefined;
  const selected = store((s) => s.selection.includes(id));
  const zoom = store((s) => s.viewport.zoom);
  if (!n?.points) return null;
  const [p0, p1] = n.points as [P, P];
  const bend = (n.bend ?? null) as P | null;
  const px = strokePx(n.strokeWidth ?? 1);
  const d = linePath({ p0, p1, bend, roughness: n.roughness ?? 1, strokeWidth: n.strokeWidth ?? 1, seed: n.seed ?? 1 });
  const from = bend ?? p0, ang = Math.atan2(p1.y - from.y, p1.x - from.x), L = 10 + 2 * px;
  const wing = (s: number): string => `${p1.x - L * Math.cos(ang + s * 0.5)} ${p1.y - L * Math.sin(ang + s * 0.5)}`;
  const mid = curveMid(p0, p1, bend);
  const K = 12 / zoom;
  const knob = (tid: string, p: P, which: 0 | 1 | "mid") => (
    <div key={tid} data-testid={tid} onPointerDown={start(which)} onDoubleClick={which === "mid" ? straighten : (e) => e.stopPropagation()}
      style={{ position: "absolute", left: p.x - K / 2, top: p.y - K / 2, width: K, height: K, borderRadius: "50%", boxSizing: "border-box", border: `${1.5 / zoom}px solid var(--accent)`, background: which === "mid" ? "var(--surface)" : "var(--accent)", cursor: "grab", touchAction: "none", zIndex: 6 }} />
  );
  function straighten(e: React.MouseEvent) {
    e.stopPropagation();
    const s = store.getState(), cur = s.nodes[id] as (Record<string, any> & { x: number; y: number }) | undefined;
    if (!cur || !cur.bend) return;
    s.commit();
    const a = (p: P): P => ({ x: cur.x + p.x, y: cur.y + p.y });
    const b = normalizeLine(a(cur.points[0]), a(cur.points[1]), null);
    s.updateNode(id, { x: b.x, y: b.y, w: b.w, h: b.h, points: b.points, bend: null });
  }
  function start(which: 0 | 1 | "mid") {
    return (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      const board = target.closest('[data-testid="board"]')!;
      let began = false;
      const move = (m: PointerEvent) => {
        const s = store.getState(), cur = s.nodes[id] as (Record<string, any> & { x: number; y: number }) | undefined;
        if (!cur) return;
        if (!began) { began = true; s.commit(); } // 끌기 1번 = 1단계
        const r = board.getBoundingClientRect(), v = s.viewport;
        const w: P = { x: (m.clientX - r.left - r.width / 2 - v.x) / v.zoom, y: (m.clientY - r.top - r.height / 2 - v.y) / v.zoom };
        const a = (p: P): P => ({ x: cur.x + p.x, y: cur.y + p.y });
        let a0 = a(cur.points[0]), a1 = a(cur.points[1]), c = cur.bend ? a(cur.bend) : null;
        if (which === "mid") c = bendFromMid(a0, a1, w);
        else if (which === 0) a0 = snapAngle(a1, w, m.shiftKey);
        else a1 = snapAngle(a0, w, m.shiftKey);
        const b = normalizeLine(a0, a1, c);
        s.updateNode(id, { x: b.x, y: b.y, w: b.w, h: b.h, points: b.points, bend: b.bend });
      };
      const up = () => {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
        target.removeEventListener("pointercancel", up);
      };
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", up);
      target.addEventListener("pointercancel", up);
    };
  }
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", opacity: (n.opacity ?? 100) / 100 }}>
      <svg width={1} height={1} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
        <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(14, px + 10)} style={{ pointerEvents: "stroke" }} />
        <path data-testid="line-path" d={d} fill="none" stroke={inkVar(n.stroke)} strokeWidth={px} strokeDasharray={dashFor(n.strokeStyle, px)} strokeLinecap="round" strokeLinejoin="round" />
        {n.head && <path data-testid="arrow-head" d={`M${wing(1)}L${p1.x} ${p1.y}L${wing(-1)}`} fill="none" stroke={inkVar(n.stroke)} strokeWidth={px} strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
      {selected && [knob("knob-0", p0, 0), knob("knob-1", p1, 1), knob("knob-mid", mid, "mid")]}
    </div>
  );
}
