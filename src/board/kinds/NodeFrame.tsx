// S-808: 크기 조절 가능한 종류가 선택됐을 때 얹는 8핸들(콘솔과 같은 모양). 최소 크기는 종류별 registry 값
import { useScope } from "../BoardScope";
import { ratioResize } from "../../images/sizing";
import type { KindDef } from "./registry";

const HANDLES = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;
const handleStyle = (h: string): React.CSSProperties => {
  const S = 10;
  const st: React.CSSProperties = { position: "absolute", width: S, height: S, zIndex: 5, touchAction: "none" };
  if (h.includes("n")) st.top = -S / 2; else if (h.includes("s")) st.bottom = -S / 2; else { st.top = S / 2; st.bottom = S / 2; st.height = "auto"; }
  if (h.includes("w")) st.left = -S / 2; else if (h.includes("e")) st.right = -S / 2; else { st.left = S / 2; st.right = S / 2; st.width = "auto"; }
  st.cursor = h === "n" || h === "s" ? "ns-resize" : h === "e" || h === "w" ? "ew-resize" : h === "ne" || h === "sw" ? "nesw-resize" : "nwse-resize";
  if (h.length === 2) { st.width = S * 1.6; st.height = S * 1.6; if (h.includes("n")) st.top = -S * 0.8; else st.bottom = -S * 0.8; if (h.includes("w")) st.left = -S * 0.8; else st.right = -S * 0.8; }
  return st;
};

export default function NodeFrame({ id, def }: { id: string; def: KindDef }) {
  const { store: useBoard } = useScope();
  const start = (h: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const n = useBoard.getState().nodes[id];
    if (!n) return;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const z = useBoard.getState().viewport.zoom;
    const s0 = { x: n.x, y: n.y, w: n.w, h: n.h, px: e.clientX, py: e.clientY };
    const { w: minW, h: minH } = def.minSize;
    let began = false;
    const move = (m: PointerEvent) => {
      if (!began) { began = true; useBoard.getState().commit(); } // 끌기 1번 = 1단계
      const dx = (m.clientX - s0.px) / z, dy = (m.clientY - s0.py) / z;
      if (def.keepRatio) return void useBoard.getState().updateNode(id, ratioResize(s0, h, dx, dy, def.minSize)); // S-890 비율 고정
      let { x, y, w, h: hh } = s0;
      if (h.includes("e")) w = Math.max(minW, s0.w + dx);
      if (h.includes("w")) { w = Math.max(minW, s0.w - dx); x = s0.x + s0.w - w; }
      if (h.includes("s")) hh = Math.max(minH, s0.h + dy);
      if (h.includes("n")) { hh = Math.max(minH, s0.h - dy); y = s0.y + s0.h - hh; }
      useBoard.getState().updateNode(id, { x, y, w, h: hh });
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
  return <>{HANDLES.filter((h) => !def.widthOnly || h === "e" || h === "w").map((h) => <div key={h} data-handle={h} style={handleStyle(h)} onPointerDown={start(h)} />)}</>;
}
