// S-820·S-821: Shapes 도구가 켜진 동안 보드 위에 얹는 층. 누르면 놓고, 끌면 그 크기로 그린다
import { useRef, useState } from "react";
import { useScope } from "../BoardScope";
import { placeShape } from "./place";
import type { P } from "./rough";
import { SHAPE_CHOICES, useArmedShape } from "./shapeChoices";
import { snapAngle } from "./snap";

type Drag = { x0: number; y0: number; x1: number; y1: number; shift: boolean };

export default function ShapeLayer() {
  const { store } = useScope();
  const armed = useArmedShape((s) => s.id);
  const [drag, setDrag] = useState<Drag | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const choice = SHAPE_CHOICES.find((c) => c.id === armed);
  const world = (cx: number, cy: number): P => {
    const r = ref.current!.getBoundingClientRect(), v = store.getState().viewport;
    return { x: (cx - r.left - r.width / 2 - v.x) / v.zoom, y: (cy - r.top - r.height / 2 - v.y) / v.zoom };
  };
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0 || !choice) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, shift: e.shiftKey });
  };
  const move = (e: React.PointerEvent) => drag && setDrag({ ...drag, x1: e.clientX, y1: e.clientY, shift: e.shiftKey });
  const up = (e: React.PointerEvent) => {
    if (!drag || !choice) return;
    setDrag(null);
    const a = world(drag.x0, drag.y0);
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 3) placeShape(store, choice, a); // 3px 미만 = 클릭
    else {
      const b = world(e.clientX, e.clientY);
      placeShape(store, choice, a, choice.kind === "line" ? snapAngle(a, b, e.shiftKey) : b);
    }
    store.getState().setTool("select");
  };
  const r = ref.current?.getBoundingClientRect();
  const far = drag && Math.hypot(drag.x1 - drag.x0, drag.y1 - drag.y0) >= 3;
  return (
    <div ref={ref} data-testid="shape-layer" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDrag(null)}
      style={{ position: "absolute", inset: 0, zIndex: 10, cursor: "crosshair", touchAction: "none" }}>
      {far && r && choice && (() => {
        const l = Math.min(drag.x0, drag.x1) - r.left, t = Math.min(drag.y0, drag.y1) - r.top, w = Math.abs(drag.x1 - drag.x0), h = Math.abs(drag.y1 - drag.y0);
        return choice.kind === "line" ? (
          <svg data-testid="shape-preview" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
            <line x1={drag.x0 - r.left} y1={drag.y0 - r.top} x2={drag.x1 - r.left} y2={drag.y1 - r.top} stroke="var(--accent)" strokeDasharray="4 3" />
          </svg>
        ) : (
          <div data-testid="shape-preview" style={{ position: "absolute", left: l, top: t, width: w, height: h, border: "1px dashed var(--accent)", borderRadius: choice.id === "ellipse" ? "50%" : 0, pointerEvents: "none" }} />
        );
      })()}
    </div>
  );
}
