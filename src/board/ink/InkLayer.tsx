// S-861~S-868: 펜·지우개일 때 보드 전체를 덮는 투명 포인터 층. 월드 좌표로 바꿔 점을 모으고, 휠·가운데 버튼 팬은 보드가 받는다(왼쪽 버튼만 쓴다)
import { useEffect, useReducer, useRef, useState } from "react";
import { useBoardStore } from "../BoardScope";
import { inkVar } from "../ink-colors";
import { getKind } from "../kinds/registry";
import { newId } from "../store";
import { ERASER_R, sweep } from "./eraser";
import Palette from "./Palette";
import { inking, useInkPen } from "./pen";
import { addPoint, MAX_POINTS, pathD, toBox, type Pt } from "./stroke";

const fill: React.CSSProperties = { position: "absolute", inset: 0, touchAction: "none" };
/** 화면 좌표 → 월드 좌표 (층이 보드를 덮으므로 층의 사각형이 보드 사각형) */
function useToWorld(el: React.RefObject<HTMLDivElement | null>, st: () => { viewport: { x: number; y: number; zoom: number } }) {
  return (cx: number, cy: number): Pt => {
    const r = el.current!.getBoundingClientRect(), v = st().viewport;
    return [(cx - r.left - r.width / 2 - v.x) / v.zoom, (cy - r.top - r.height / 2 - v.y) / v.zoom];
  };
}
const coalesced = (e: React.PointerEvent): { clientX: number; clientY: number }[] => {
  const l = e.nativeEvent.getCoalescedEvents?.();
  return l && l.length ? l : [e.nativeEvent];
};

export function PenLayer() {
  const store = useBoardStore();
  const v = store((s) => s.viewport);
  const ref = useRef<HTMLDivElement>(null);
  const toWorld = useToWorld(ref, store.getState);
  const cur = useRef<{ pts: Pt[]; color: string; width: number } | null>(null);
  const [, redraw] = useReducer((x: number) => x + 1, 0);

  const finish = () => {
    const c = cur.current;
    cur.current = null;
    inking.on = false;
    redraw();
    if (!c || !c.pts.length) return;
    const s = store.getState(), b = toBox(c.pts, c.width);
    s.commit(); // 한 획 = 되돌리기 1단계(S-862)
    s.addNode({ id: newId("ink", s.nodes), kind: "ink", x: b.x, y: b.y, w: b.w, h: b.h, z: Object.values(s.nodes).reduce((m, n) => Math.max(m, n.z), 0) + 1, points: b.points, color: c.color, width: c.width });
  };
  // 그리는 도중 Esc = 그 획을 버린다(펜은 그대로). 보드의 Esc 보다 먼저 받는다
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !cur.current) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      cur.current = null;
      inking.on = false;
      redraw();
    };
    window.addEventListener("keydown", esc, true);
    return () => (window.removeEventListener("keydown", esc, true), void (inking.on = false));
  }, []);

  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (document.activeElement as HTMLElement | null)?.blur?.(); // 보드가 키보드를 되찾음(Ctrl+Z·Esc)
    ref.current!.setPointerCapture(e.pointerId);
    const { color, width } = useInkPen.getState();
    cur.current = { pts: [], color, width };
    inking.on = true;
    addPoint(cur.current.pts, toWorld(e.clientX, e.clientY), store.getState().viewport.zoom);
    redraw();
  };
  const move = (e: React.PointerEvent) => {
    const c = cur.current;
    if (!c) return;
    const zoom = store.getState().viewport.zoom;
    for (const m of coalesced(e)) addPoint(c.pts, toWorld(m.clientX, m.clientY), zoom);
    if (c.pts.length >= MAX_POINTS) return finish(); // 상한: 더 받지 않고 획을 끝낸다
    redraw();
  };
  const pts = cur.current?.pts;
  return (
    <>
      <div ref={ref} data-testid="pen-layer" onPointerDown={down} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} style={{ ...fill, cursor: "crosshair" }}>
        {pts && cur.current && (
          <svg width={1} height={1} style={{ position: "absolute", left: "50%", top: "50%", overflow: "visible", transformOrigin: "0 0", transform: `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`, pointerEvents: "none" }}>
            <path d={pathD(pts)} fill="none" stroke={inkVar(cur.current.color)} strokeWidth={cur.current.width} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <Palette />
    </>
  );
}

export function EraserLayer() {
  const store = useBoardStore();
  const ref = useRef<HTMLDivElement>(null);
  const toWorld = useToWorld(ref, store.getState);
  const drag = useRef<{ last: Pt; erased: boolean } | null>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  // a→b 를 지나간 노드를 바로 지운다. 한 드래그의 첫 삭제만 되돌리기 기록을 만들고 나머지는 거기에 합친다(S-867)
  const erase = (a: Pt, b: Pt) => {
    const d = drag.current!, s = store.getState();
    const ids = sweep(Object.values(s.nodes), { x: a[0], y: a[1] }, { x: b[0], y: b[1] }, ERASER_R / s.viewport.zoom, (n) => !!getKind(n.kind)?.eraserTarget);
    if (!ids.length) return;
    s.removeNodes(ids, d.erased);
    d.erased = true;
  };
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    ref.current!.setPointerCapture(e.pointerId);
    const p = toWorld(e.clientX, e.clientY);
    drag.current = { last: p, erased: false };
    erase(p, p);
  };
  const move = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    setAt({ x: e.clientX - r.left, y: e.clientY - r.top });
    const d = drag.current;
    if (!d) return;
    for (const m of coalesced(e)) {
      const p = toWorld(m.clientX, m.clientY);
      erase(d.last, p);
      d.last = p;
    }
  };
  const up = () => (drag.current = null);
  return (
    <div ref={ref} data-testid="eraser-layer" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={() => setAt(null)} style={{ ...fill, cursor: "none" }}>
      {at && <div data-testid="eraser-cursor" style={{ position: "absolute", left: at.x - ERASER_R, top: at.y - ERASER_R, width: ERASER_R * 2, height: ERASER_R * 2, borderRadius: "50%", border: "1.5px solid var(--fg)", pointerEvents: "none" }} />}
    </div>
  );
}
