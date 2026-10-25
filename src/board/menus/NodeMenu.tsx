import { useRef, useState } from "react";
import { getSession, requestClose } from "../../console/session";
import { toggleMax, useMax } from "../../console/maximize";
import { sessionKey } from "../../console/sessionKey";
import { toggleSession } from "../../console/pause";
import { termCopy, termPaste, termSelectAll, termSelection } from "../../terminal/termClipboard";
import { TIDY_KEY_LABEL, tidyBoard } from "../tidy";
import { setConsoleTextSize, type TextSizeChoice } from "../../terminal/textSize";
import { useScope } from "../BoardScope";
import { tm } from "../../i18n";
import { isConsole } from "../store";
import { getKind } from "../kinds/registry";
import { Item, menuBox, useEscClose, useMenuKeys } from "./menuKit";
import ExportItems from "../../diagrams/ExportItems";

const SIZES: TextSizeChoice[] = ["global", 85, 100, 115, 130, 150, 175, 200];

// S-046: 노드 우클릭. ids = 대상 노드들. 콘솔은 Text size, 2개 이상이면 Group·Tidy up. term = 우클릭한 곳이 터미널 본문(.xterm)이면 그 요소(S-2643)
export default function NodeMenu({ at, ids, term, onClose }: { at: { x: number; y: number }; ids: string[]; term?: Element | null; onClose: () => void }) {
  const { wsId, store: useBoard } = useScope();
  const sc = { wsId, store: useBoard };
  const [size, setSize] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useMenuKeys(root); // useEscClose 보다 먼저: Esc 로 닫히는 순간(React 가 바로 비움)보다 앞서 Esc 를 봐야 포커스 복원을 안다
  useEscClose(onClose);
  const maxKey = useMax((s) => s.key);
  const st = useBoard.getState();
  const consoleIds = ids.filter((id) => isConsole(st.nodes[id]));
  const dids = new Set(ids.map((id) => st.nodes[id]?.diagramId));
  const diagramId = dids.size === 1 ? [...dids][0] : undefined;
  const groupIds = new Set(consoleIds.flatMap((id) => { const g = (st.nodes[id] as { groupId?: string }).groupId; return g ? [g] : []; }));
  const done = (f: () => void) => () => { onClose(); f(); };
  return (
    <div ref={root} data-testid="node-menu" role="menu" onPointerDown={(e) => e.stopPropagation()} style={{ ...menuBox, left: at.x, top: at.y }}>
      {term && termSelection(term) !== "" && <Item label={tm("Copy")} onClick={done(() => void termCopy(term))} />}
      {term && <Item label={tm("Paste")} onClick={done(() => void termPaste(term))} />}
      {term && <Item label={tm("Select all")} onClick={done(() => termSelectAll(term))} />}
      {ids.length === 1 && consoleIds.length === 1 && <Item label={maxKey === sessionKey(wsId, ids[0]!) ? tm("Restore") : tm("Maximize")} extra="Ctrl+Shift+Enter" onClick={done(() => toggleMax(sessionKey(wsId, ids[0]!)))} />}
      {ids.length === 1 && consoleIds.length === 1 && <Item label={getSession(wsId, ids[0]!)?.isPaused() ? tm("Resume") : tm("Pause")} onClick={done(() => { const s = getSession(wsId, ids[0]!); if (s) toggleSession(s); })} />}
      <Item label={tm("Duplicate")} onClick={done(() => useBoard.getState().duplicate(ids))} />
      <Item label={tm("Bring to front")} onClick={done(() => useBoard.getState().bringToFront(ids))} />
      {consoleIds.length >= 2 && <Item label={tm("Group")} extra="Ctrl+G" onClick={done(() => void useBoard.getState().createGroup(ids))} />}
      {groupIds.size > 0 && <Item label={tm("Ungroup")} extra="Ctrl+Shift+G" onClick={done(() => groupIds.forEach((g) => useBoard.getState().dissolveGroup(g)))} />}
      {ids.length >= 2 && <Item label={tm("Tidy up")} extra={TIDY_KEY_LABEL} onClick={done(() => tidyBoard(useBoard))} />}
      {ids.length === 1 && getKind(st.nodes[ids[0]!]?.kind ?? "")?.nodeMenu?.(ids[0]!, useBoard).map((m) => <Item key={m.label} label={m.label} onClick={done(m.run)} />)}
      {typeof diagramId === "string" && <ExportItems diagramId={diagramId} onDone={onClose} />} {/* E3 S-2037: 한 그림의 조각들(전부 같은 diagramId)만 대상일 때 */}
      <Item label={tm("Delete")} onClick={done(() => void requestClose(ids, sc))} />
      {consoleIds.length > 0 && <Item label={tm("Text size")} extra="›" onClick={() => setSize((v) => !v)} />}
      {size && SIZES.map((s) => (
        <Item key={s} label={s === "global" ? tm("Global") : `${s}%`} style={{ paddingLeft: 20 }}
          onClick={done(() => consoleIds.forEach((id) => setConsoleTextSize(id, s, useBoard)))} />
      ))}
    </div>
  );
}
