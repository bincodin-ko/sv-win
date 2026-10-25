import { useEffect, useRef, useState } from "react";
import { agentsList, type AgentInfo } from "../../agents/api";
import { useUi } from "../../ui/useUi";
import { kindsWith } from "../kinds/registry";
import { SHAPE_CHOICES, type ShapeChoice } from "../shapes/shapeChoices";
import { tm } from "../../i18n";
import { TIDY_KEY_LABEL } from "../tidy";
import { spawnRows } from "./spawnRows";
import { Item, itemStyle, menuBox, useEscClose, useMenuKeys } from "./menuKit";

// S-045: 빈 캔버스 우클릭 고리. 항목을 누른 지점 둘레 원 위에 놓는다. 1묶음에 있는 항목만
type Entry = { label: string; run: () => void; extra?: string; why?: string };
export default function RadialMenu({ at, onClose, onPlaceKind, onPlaceShape, onSpawn, onSpawnInFolder, onSpawnGroup, onPaste, onSelectAll, onFit, onZoom100, onTidy }: {
  at: { x: number; y: number }; onClose: () => void; onPlaceKind: (kind: string) => void; onPlaceShape: (choice: ShapeChoice) => void; onSpawn: (agentId: string) => void; onSpawnInFolder: () => void; onSpawnGroup: () => void;
  onPaste: () => void; onSelectAll: () => void; onFit: () => void; onZoom100: () => void; onTidy: () => void;
}) {
  const [sub, setSub] = useState<null | "spawn" | "other" | "more" | "shapes">(null);
  const [list, setList] = useState<AgentInfo[]>([]);
  const root = useRef<HTMLDivElement>(null);
  useMenuKeys(root, sub, true); // useEscClose 보다 먼저(NodeMenu 주석 참고)
  useEscClose(onClose);
  useEffect(() => void agentsList().then(setList), []);
  const done = (f: () => void) => () => { f(); onClose(); };

  const hasYours = list.some((a) => a.section === "yours");
  const entries: Entry[] =
    sub === "spawn"
      ? [...spawnRows(list).map((r) => ({ label: r.name, why: r.why, run: r.why ? () => {} : done(() => onSpawn(r.id)) })), ...(hasYours ? [{ label: tm("Other"), run: () => setSub("other") }] : []), { label: tm("In folder…"), run: done(onSpawnInFolder) }]
      : sub === "other"
        ? list.filter((a) => a.section === "yours").map((a) => ({ label: a.name, run: done(() => onSpawn(a.id)) }))
      : sub === "shapes"
        ? SHAPE_CHOICES.map((c) => ({ label: c.label, run: done(() => onPlaceShape(c)) }))
      : sub === "more"
        ? [...kindsWith("more").map((k) => ({ label: k.more!.label, run: done(() => onPlaceKind(k.id)) })), { label: tm("Mission Map"), run: done(() => useUi.getState().openMission()) }, { label: tm("Tidy up"), run: done(onTidy), extra: TIDY_KEY_LABEL }, { label: tm("Select all"), run: done(onSelectAll) }, { label: tm("Fit to content"), run: done(onFit) }, { label: tm("Zoom to 100%"), run: done(onZoom100) }]
        : [{ label: tm("Spawn agent"), run: () => setSub("spawn") }, ...kindsWith("ring").map((k) => ({ label: k.ring!.label, run: done(() => onPlaceKind(k.id)) })), { label: tm("Paste"), run: done(onPaste) }, { label: tm("Shapes"), run: () => setSub("shapes") }, { label: tm("Spawn group"), run: done(onSpawnGroup) }, { label: tm("More"), run: () => setSub("more") }];
  const R = sub === "spawn" || sub === "other" ? 110 : 80;
  return (
    <div ref={root} data-testid="ring-menu" role="menu" onPointerDown={(e) => e.stopPropagation()} style={{ ...menuBox, left: at.x - 1, top: at.y - 1, width: 2, height: 2, minWidth: 0, padding: 0, border: 0, background: "none", boxShadow: "none" }}>
      {entries.map((en, i) => {
        const a = (-90 + (360 / entries.length) * i) * (Math.PI / 180);
        return (
          <Item key={en.label} label={en.label} title={en.why} extra={en.extra} onClick={en.run} data-disabled={en.why ? "true" : undefined}
            style={{ ...itemStyle, ...(en.why ? { color: "var(--mute)", cursor: "default" } : {}), position: "absolute", left: 1 + Math.cos(a) * R, top: 1 + Math.sin(a) * R, transform: "translate(-50%,-50%)", width: "auto", whiteSpace: "nowrap", background: "var(--surface)", border: "1px solid var(--bd)", borderRadius: 16, padding: "6px 12px" }} />
        );
      })}
    </div>
  );
}
