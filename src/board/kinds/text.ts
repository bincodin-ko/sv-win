// C10: text 노드 종류와 Text 도구 (S-844~S-848). 인스펙터는 Lines(글자색)·Text·Order 절
import TextNode from "../../notes/TextBox";
import { placeText } from "../../notes/place";
import { TEXT_DEFAULT_W, TEXT_MIN_W, makeText } from "../../notes/textNode";
import { registerInspectorKind } from "../shapes/inspectorFields";
import { registerTool } from "../toolsRegistry";
import { registerKind } from "./registry";
import { tm } from "../../i18n";

registerKind({
  id: "text", label: tm("Text"), Component: TextNode, defaultSize: { w: TEXT_DEFAULT_W, h: 34 }, minSize: { w: TEXT_MIN_W, h: 24 }, resizable: true, widthOnly: true, bodyDrag: true, eraserTarget: true,
  create: (o) => makeText(o?.text as string | undefined),
});
registerInspectorKind("text", ["lines", "text", "order"]);
registerTool({ id: "text", label: tm("Text"), icon: "T", order: 35, onPlace: (store, at) => void placeText(store, at) });
