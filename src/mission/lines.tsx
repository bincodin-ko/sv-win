// S-1302·S-1314 곡선 선: 노드 상자의 오른쪽 가운데 → 왼쪽 가운데. 선도 노드도 같은 스크롤 안(host)에 있어 함께 움직인다
import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from "react";
import type { MLine } from "./model";

type P = MLine & { d: string };

export default function Lines({ lines, host }: { lines: MLine[]; host: RefObject<HTMLDivElement | null> }) {
  const [paths, setPaths] = useState<P[]>([]);
  const measure = useCallback(() => {
    const h = host.current;
    if (!h) return;
    const hr = h.getBoundingClientRect();
    const box = (id: string) => h.querySelector(`[data-mm="${id}"]`)?.getBoundingClientRect();
    const next: P[] = [];
    for (const l of lines) {
      const a = box(l.from), b = box(l.to);
      if (!a || !b) continue;
      const x1 = a.right - hr.left, y1 = a.top + a.height / 2 - hr.top, x2 = b.left - hr.left, y2 = b.top + b.height / 2 - hr.top, dx = Math.max(24, (x2 - x1) / 2);
      next.push({ ...l, d: `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}` });
    }
    setPaths((prev) => (prev.length === next.length && prev.every((p, i) => p.d === next[i]!.d && p.id === next[i]!.id) ? prev : next));
  }, [lines, host]);
  useLayoutEffect(measure); // 매 그림마다 다시 잰다(같으면 상태를 안 바꾼다)
  useEffect(() => {
    const h = host.current;
    const ro = h && typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null; // S-1314: 창 크기가 바뀌면 다시 그린다
    if (h) ro?.observe(h);
    window.addEventListener("resize", measure);
    return () => { ro?.disconnect(); window.removeEventListener("resize", measure); };
  }, [measure, host]);
  return (
    <svg data-testid="mm-lines" style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}>
      {paths.map((p) => (
        <path key={p.id} data-testid="mm-line" data-from={p.from} data-to={p.to} data-dashed={p.dashed ? "true" : "false"} d={p.d} fill="none"
          stroke={p.dashed ? "var(--mute-3)" : p.from === "cmd" ? "var(--mute-2)" : "var(--accent)"} strokeWidth={1.5} strokeDasharray={p.dashed ? "5 4" : undefined} opacity={0.8} />
      ))}
    </svg>
  );
}
