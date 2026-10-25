// E3: Diagrams 도구(S-2020). 노드 종류가 아니다 — 레일 도구 하나(패널 flyout + 빈 캔버스 클릭 = Flow 스타터)만 등록한다
import DiagramsPanel from "../../diagrams/DiagramsPanel";
import { placeStarter } from "../../diagrams/starters";
import { registerTool } from "../toolsRegistry";
import { tm } from "../../i18n";

registerTool({ id: "diagrams", label: tm("Diagrams"), icon: "⬚", order: 32, flyout: DiagramsPanel, onPlace: (store, at) => void placeStarter(store, "flow", at) });
