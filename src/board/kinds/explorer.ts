// S-962·S-963·S-964: 코드 탐색기 카드 종류. 필드 dir·name·files(최대 40)·selected
import ExplorerCard from "../../files/ExplorerCard";
import { EXPLORER_MAX } from "../../files/make";
import { registerKind } from "./registry";
import { tm } from "../../i18n";

registerKind({
  id: "explorer", label: tm("Code explorer"), Component: ExplorerCard,
  defaultSize: { w: 600, h: 380 }, minSize: { w: 360, h: 200 }, resizable: true, bodyDrag: false, eraserTarget: true,
  create: (o) => ({ ...o, files: ((o?.files as string[] | undefined) ?? []).slice(0, EXPLORER_MAX) }),
});
