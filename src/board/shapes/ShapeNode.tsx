// S-822·S-824·S-827~S-829: 사각형·타원·마름모 (SVG). 더블클릭하면 안에 글
import { useMemo, useState } from "react";
import { useScope } from "../BoardScope";
import { inkVar } from "../ink-colors";
import { hatchLines, type FillStyle } from "./hatch";
import { shapePath, strokePx, type ShapeName } from "./rough";
import { fontStack, sizePx } from "./textStyle";

export const dashFor = (style: unknown, px: number): string | undefined => (style === "dashed" ? `${px * 3} ${px * 2}` : style === "dotted" ? `1 ${px * 2}` : undefined);

export default function ShapeNode({ id }: { id: string }) {
  const { store } = useScope();
  const n = store((s) => s.nodes[id]) as Record<string, any> | undefined;
  const [editing, setEditing] = useState(false);
  const w = n?.w ?? 0, h = n?.h ?? 0;
  const sw = (n?.strokeWidth as number) ?? 1;
  const d = useMemo(
    () => shapePath({ shape: (n?.shape ?? "rectangle") as ShapeName, w, h, edges: n?.edges === "sharp" ? "sharp" : "round", roughness: n?.roughness ?? 1, strokeWidth: sw, seed: n?.seed ?? 1 }),
    [n?.shape, w, h, n?.edges, n?.roughness, sw, n?.seed],
  );
  if (!n) return null;
  const px = strokePx(sw), filled = n.fill && n.fill !== "transparent", fs = (n.fillStyle ?? "hachure") as FillStyle;
  const finish = (v: string) => {
    setEditing(false);
    if (v === (n.text ?? "")) return;
    store.getState().commit();
    store.getState().updateNode(id, { text: v });
  };
  const textBox: React.CSSProperties = { position: "absolute", inset: 8, font: "inherit", fontFamily: fontStack(n.font), fontSize: sizePx(n.size), lineHeight: 1.25, textAlign: (n.align ?? "center") as "left", color: "var(--fg)", overflow: "hidden" };
  return (
    <div data-testid="shape-body" onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
      style={{ position: "relative", width: "100%", height: "100%", opacity: (n.opacity ?? 100) / 100 }}>
      <svg width={w} height={h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
        <defs><clipPath id={`clip-${id}`}><path d={d} /></clipPath></defs>
        {filled && fs === "solid" && <path d={d} fill={inkVar(n.fill)} stroke="none" />}
        {filled && fs !== "solid" && (
          <g clipPath={`url(#clip-${id})`} stroke={inkVar(n.fill)} strokeWidth={Math.max(1, px / 2)}>
            {hatchLines(fs, w, h, sw).map((l, i) => <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />)}
          </g>
        )}
        <path data-testid="shape-path" d={d} fill="none" stroke={inkVar(n.stroke)} strokeWidth={px} strokeDasharray={dashFor(n.strokeStyle, px)} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {editing ? (
        <textarea data-testid="shape-text-input" autoFocus defaultValue={n.text ?? ""}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => finish(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); e.currentTarget.blur(); } }}
          style={{ ...textBox, background: "transparent", border: "1px dashed var(--accent)", outline: "none", resize: "none" }} />
      ) : n.text ? (
        <div style={{ ...textBox, display: "flex", alignItems: "center", justifyContent: n.align === "left" ? "flex-start" : n.align === "right" ? "flex-end" : "center", whiteSpace: "pre-wrap", pointerEvents: "none" }}>
          <span style={{ maxWidth: "100%", overflowWrap: "anywhere" }}>{n.text}</span>
        </div>
      ) : null}
    </div>
  );
}
