// C5: 도형(shape)·선(line) 종류와 Shapes 도구 등록 (S-820~S-831)
import { registerTool } from "../toolsRegistry";
import LineNode from "../shapes/LineNode";
import ShapeLayer from "../shapes/ShapeLayer";
import ShapeNode from "../shapes/ShapeNode";
import ShapesFlyout from "../shapes/ShapesFlyout";
import { LINE_LEN, SHAPE_SIZE, lineDefaults, shapeDefaults } from "../shapes/shapeChoices";
import { registerKind } from "./registry";
import { tm } from "../../i18n";

const common = { eraserTarget: true, bodyDrag: true };
registerKind({
  ...common, id: "shape", label: tm("Shape"), Component: ShapeNode, defaultSize: SHAPE_SIZE, minSize: { w: 24, h: 24 }, resizable: true,
  create: (o) => ({ ...shapeDefaults(), shape: (o?.shape as string) ?? "rectangle" }),
});
registerKind({
  ...common, id: "line", label: tm("Line"), Component: LineNode, defaultSize: { w: LINE_LEN, h: 1 }, minSize: { w: 1, h: 1 }, resizable: false,
  create: (o) => ({ ...lineDefaults(), head: !!o?.head, points: [{ x: 0, y: 0 }, { x: LINE_LEN, y: 0 }] }),
});
registerTool({ id: "shapes", label: tm("Shapes"), icon: "◇", order: 30, flyout: ShapesFlyout, layer: ShapeLayer });
