// S-861·S-864: 획 하나 = SVG 경로 하나. 클릭 판정은 획에서 굵기/2 + 4px (투명한 굵은 선이 받는다. 바깥 칸은 hitShape 로 pointer-events 가 꺼져 있다)
import { useBoardStore } from "../BoardScope";
import { inkVar } from "../ink-colors";
import { pathD, type Pt } from "./stroke";

export default function InkNode({ id }: { id: string }) {
  const n = useBoardStore()((s) => s.nodes[id]);
  if (!n) return null;
  const d = pathD((n.points as Pt[]) ?? []);
  const width = (n.width as number) ?? 6;
  const common = { d, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg data-testid="ink" width={n.w} height={n.h} style={{ display: "block", overflow: "visible", pointerEvents: "none" }}>
      <path {...common} stroke={inkVar((n.color as string) ?? "red")} strokeWidth={width} />
      <path {...common} stroke="transparent" strokeWidth={width + 8} style={{ pointerEvents: "stroke" }} />
    </svg>
  );
}
