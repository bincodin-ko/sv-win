// S-1250: Orchestrator 카드 종류. 우측 레일 "Insert orchestrator".
import { makeOrchestrator } from "../../orchestrator/add";
import OrchestratorCard from "../../orchestrator/OrchestratorCard";
import { registerKind } from "./registry";
import { tm } from "../../i18n";

registerKind({
  id: "orchestrator", label: tm("orchestrator"), Component: OrchestratorCard,
  defaultSize: { w: 380, h: 520 }, // 추측(S-1250)
  minSize: { w: 300, h: 260 },
  resizable: true,
  bodyDrag: false, // 머리줄만 끌린다
  eraserTarget: false,
  wireColor: "orange",
  create: makeOrchestrator,
  rail: { label: tm("orchestrator"), order: 50 },
});
