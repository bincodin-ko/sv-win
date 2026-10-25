// S-811: 노드의 wireTo 마다 두 노드 가장자리 중심 사이에 선을 긋는다. 월드 좌표라 팬·줌과 같이 움직이고 노드 아래에 그린다
import { useScope } from "./BoardScope";
import { getKind } from "./kinds/registry";
import { GROUP_PAD, groupBounds, membersOf } from "./groups";
import type { BoardNode } from "./store";

const COLOR = { cyan: "var(--cyan)", violet: "var(--violet)", orange: "var(--accent)" };

/** 서로 마주 보는 가장자리 중심 두 점 */
export function wireEnds(a: BoardNode, b: BoardNode) {
  const dx = b.x + b.w / 2 - (a.x + a.w / 2), dy = b.y + b.h / 2 - (a.y + a.h / 2);
  if (Math.abs(dx) / (a.w + b.w) >= Math.abs(dy) / (a.h + b.h)) {
    const s = dx >= 0 ? 1 : -1;
    return { x1: s > 0 ? a.x + a.w : a.x, y1: a.y + a.h / 2, x2: s > 0 ? b.x : b.x + b.w, y2: b.y + b.h / 2 };
  }
  const s = dy >= 0 ? 1 : -1;
  return { x1: a.x + a.w / 2, y1: s > 0 ? a.y + a.h : a.y, x2: b.x + b.w / 2, y2: s > 0 ? b.y : b.y + b.h };
}

/** S-1223: 3차 베지어, 접선은 선이 나가는 방향(가장자리가 좌우면 가로, 위아래면 세로) */
export function wireCurve(e: { x1: number; y1: number; x2: number; y2: number }, horizontal: boolean): string {
  const k = 0.5;
  const [cx, cy] = horizontal ? [(e.x2 - e.x1) * k, 0] : [0, (e.y2 - e.y1) * k];
  return `M${e.x1} ${e.y1} C${e.x1 + cx} ${e.y1 + cy} ${e.x2 - cx} ${e.y2 - cy} ${e.x2} ${e.y2}`;
}

export default function Wires() {
  const { store: useBoard } = useScope();
  const nodes = useBoard((s) => s.nodes);
  const groups = useBoard((s) => s.groups) ?? [];
  const list = Object.values(nodes).flatMap((n) => (typeof n.wireTo === "string" && nodes[n.wireTo] ? [{ from: n, to: nodes[n.wireTo]! }] : []));
  // S-1223·S-1224: wired[] 항목마다 곡선. 대상 = 콘솔 상자 또는 그룹 할로 경계 상자(멤버 0 이면 선 없음)
  const curves = Object.values(nodes).flatMap((card) => ((card.wired as string[] | undefined) ?? []).flatMap((t) => {
    const g = groups.some((x) => x.id === t);
    const b = g ? groupBounds(membersOf(nodes, t), GROUP_PAD) : nodes[t]?.kind === "console" ? nodes[t] : null;
    if (!b) return [];
    const to = { x: b.x, y: b.y, w: b.w, h: b.h } as BoardNode;
    const e = wireEnds(card, to);
    return [{ card, to: g ? `g:${t}` : t, d: wireCurve(e, e.y1 === card.y + card.h / 2 && e.y2 === to.y + to.h / 2) }];
  }));
  return (
    <svg data-testid="wires" width={1} height={1} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none", zIndex: -1000000000 }}>
      {list.map(({ from, to }) => {
        const color = getKind(from.kind)?.wireColor ?? "cyan";
        const e = wireEnds(from, to);
        return <line key={from.id} data-testid="wire" data-from={from.id} data-to={to.id} data-wire-color={color} {...e} stroke={COLOR[color]} strokeWidth={2} strokeLinecap="round" />;
      })}
      {curves.map(({ card, to, d }) => (
        <path key={`${card.id}>${to}`} data-testid="wire" data-from={card.id} data-to={to} data-wire-color={getKind(card.kind)?.wireColor ?? "orange"} d={d} fill="none"
          stroke={COLOR[getKind(card.kind)?.wireColor ?? "orange"]} strokeWidth={2} strokeLinecap="round" />
      ))}
    </svg>
  );
}
