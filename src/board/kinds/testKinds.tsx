// 시험용 가짜 종류(e2e/kinds.spec.ts). Tauri 밖에서 주소에 ?kindsTest 가 있을 때만 등록한다. 제품 종류가 아니다.
import { getStore } from "../boards";
import { useScope } from "../BoardScope";
import { useUi } from "../../ui/useUi";
import { placeNew, registerKind, type KindDef } from "./registry";
import { registerTool, tools } from "../toolsRegistry";

const on = typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window) && window.location.search.includes("kindsTest");

/** 머리줄만 끌리는 종류(칸반류). 본문에 입력란이 있다 */
function Card({ id }: { id: string }) {
  return (
    <div data-testid="tk-card" data-id={id} style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "var(--surface)", border: "1px solid var(--bd)", borderRadius: 10, overflow: "hidden" }}>
      <div data-node-handle data-testid="tk-head" style={{ height: 28, flex: "none", borderBottom: "1px solid var(--bd)", padding: "0 8px", font: "12px system-ui" }}>Test card</div>
      <div data-testid="tk-body" style={{ flex: 1, padding: 8 }}>
        <input data-testid="tk-input" style={{ width: "90%" }} />
        <span data-testid="tk-text" style={{ display: "block", fontSize: 20, lineHeight: "24px" }}>Hello</span>
      </div>
    </div>
  );
}
/** D1 연결 시험용 카드(orchestrator·memory 대역): Connect = 연결 모드 켜기, Done = 끄기. wired 는 저장된 노드 필드 */
function Wired({ id }: { id: string }) {
  const { wsId } = useScope();
  return (
    <div data-testid="tw-card" data-id={id} style={{ width: "100%", height: "100%", background: "var(--surface)", border: "1px solid var(--bd)", borderRadius: 10, padding: 8 }}>
      <button data-testid="tw-connect" onClick={() => useUi.setState({ connect: { wsId, cardId: id } })}>Connect</button>
      <button data-testid="tw-done" onClick={() => useUi.setState({ connect: null })}>Done</button>
    </div>
  );
}
/** 본문 어디나 끌리는 종류(도형류) */
const Plain = ({ id }: { id: string }) => <div data-testid="tk-plain" data-id={id} style={{ width: "100%", height: "100%", background: "var(--surface-2)", border: "1px solid var(--bd)" }} />;

const size = (w: number, h: number) => ({ w, h });
const base = { eraserTarget: false, resizable: false, bodyDrag: true, minSize: size(40, 40) };
const defs: KindDef[] = [
  { ...base, id: "tk-card", label: "Test card", Component: Card, defaultSize: size(300, 200), minSize: size(200, 120), resizable: true, bodyDrag: false,
    ring: { label: "Test card", order: 90 }, more: { label: "Test more", order: 90 }, insertTodo: { label: "Test todo", order: 90 } },
  { ...base, id: "tk-plain", label: "Test plain", Component: Plain, defaultSize: size(200, 120), eraserTarget: true },
  { ...base, id: "tk-link", label: "Test link", Component: Plain, defaultSize: size(160, 100), wireColor: "cyan" },
  { ...base, id: "tk-insp", label: "Test inspector", Component: Plain, defaultSize: size(160, 100), wireColor: "cyan", deleteWithTarget: true },
  // D1: wired[] 를 가진 카드. tk-orch = orange(orchestrator 대역) + 우측 레일 버튼, tk-mem = violet(memory 대역)
  { ...base, id: "tk-orch", label: "Test orch", Component: Wired, defaultSize: size(240, 120), wireColor: "orange", eraserTarget: false, rail: { label: "Test orch", order: 90 } },
  { ...base, id: "tk-mem", label: "Test mem", Component: Wired, defaultSize: size(240, 120), wireColor: "violet", eraserTarget: true },
];

if (on) {
  defs.forEach(registerKind);
  const o = (id: string) => tools().find((t) => t.id === id)?.order ?? 0;
  registerTool({ id: "tk-card", label: "Test card", order: (o("spawn") + o("fit")) / 2, onPlace: (store, at) => void placeNew(store, "tk-card", undefined, at) });
  // 시험 읽기 창구(상태 읽기 전용)
  Object.assign(window, {
    __kt: {
      st: (ws = "ws-fake") => { const s = getStore(ws).getState(); return { tool: s.tool, selection: s.selection, nodes: Object.values(s.nodes) }; },
      ui: () => { const u = useUi.getState(); return { gitOpen: u.gitOpen, connect: u.connect, mission: u.mission.open, memory: u.memory.open, loops: u.loops.open, usage: u.usage }; },
      setUi: (p: Record<string, unknown>) => useUi.setState(p), // D1: 패널 여러 개가 동시에 열린 상태를 만든다(Esc 순서 시험)
      undo: (ws = "ws-fake") => getStore(ws).getState().undo(),
    },
  });
}
