// B7 그룹 할로 (S-502·S-503·S-506): 멤버를 둘러싼 점선 틀 + 헤더 라벨. 틀은 포인터를 받지 않고, 헤더 라벨만 받는다.
import { useEffect, useMemo, useState } from "react";
import { getSession } from "../console/session";
import { useScope } from "./BoardScope";
import { connectToggle } from "./connect";
import { GROUP_NAME_MAX, GROUP_PAD, groupBounds, groupLabel, runningCount, type Group } from "./groups";
import { roleColor } from "./roles";
import { useT } from "../i18n";
import { startPoll } from "../perf/poll";
import type { BoardNode } from "./store";

export default function GroupHalo({ group, members }: { group: Group; members: BoardNode[] }) {
  const t = useT();
  const { wsId, store, visible } = useScope();
  const [running, setRunning] = useState(0);
  const [editing, setEditing] = useState(false);
  const ids = members.map((m) => m.id).sort();
  const key = ids.join(",");
  // ponytail: 세션에 구독 통로가 없어 0.5초마다 센다. 지연이 거슬리면 session 에 상태 알림을 만든다
  useEffect(() => {
    const count = () => setRunning(runningCount(members, (id) => !!getSession(wsId, id)?.isRunning()));
    return visible ? startPoll(count, 500) : undefined; // 숨은 워크스페이스는 멈췄다가 보일 때 한 번 센다
  }, [key, wsId, visible]);
  const b = useMemo(() => groupBounds(members, GROUP_PAD), [members]);
  if (!b) return null;
  const color = roleColor(group.role);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const save = (v: string) => { setEditing(false); store.getState().renameGroup(group.id, v); };
  return (
    <div data-testid="group-halo" data-group-id={group.id} data-members={key}
      style={{ position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h, boxSizing: "border-box", border: `2px dashed ${color}`, borderRadius: 18, pointerEvents: "none", zIndex: 0 }}>
      <div style={{ position: "absolute", left: 14, top: 2, pointerEvents: "auto", color, fontSize: 15, fontWeight: 600, letterSpacing: 1, lineHeight: "26px", whiteSpace: "nowrap" }}
        onPointerDown={stop} onClick={() => connectToggle(store, wsId, group.id)} onDoubleClick={() => setEditing(true)}>
        {editing ? (
          <input data-testid="group-name-input" autoFocus defaultValue={group.name} maxLength={GROUP_NAME_MAX}
            onFocus={(e) => e.currentTarget.select()} onPointerDown={stop}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) save(e.currentTarget.value); else if (e.key === "Escape") setEditing(false); e.stopPropagation(); }}
            style={{ font: "inherit", color: "inherit", background: "var(--panel)", border: `1px solid ${color}`, borderRadius: 4, width: 220 }} />
        ) : (
          <span data-testid="group-label">{`${groupLabel(group).toUpperCase()} · ${t("{n} running", { n: running })}`}</span>
        )}
      </div>
    </div>
  );
}
