// C6: ink 노드 종류(S-864) + 펜·지우개 도구(S-860·S-866). 필드 points(상자 안 상대 좌표)·color(이름)·width
import InkNode from "../ink/InkNode";
import { EraserLayer, PenLayer } from "../ink/InkLayer";
import { registerTool } from "../toolsRegistry";
import { registerKind } from "./registry";
import { tm } from "../../i18n";

registerKind({ id: "ink", label: tm("Ink"), Component: InkNode, defaultSize: { w: 6, h: 6 }, minSize: { w: 1, h: 1 }, resizable: false, bodyDrag: true, eraserTarget: true, hitShape: true });
registerTool({ id: "pen", label: tm("Pen"), icon: "✎", order: 70, key: "pen", layer: PenLayer });
registerTool({ id: "eraser", label: tm("Eraser"), icon: "⌫", order: 75, key: "eraser", layer: EraserLayer });
