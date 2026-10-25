// S-820: Shapes 도구 옆 flyout. 항목을 고르면 그 모양이 무장되고 닫힌다
import { useRef } from "react";
import { Item, menuBox, useEscClose, useMenuKeys } from "../menus/menuKit";
import { useT } from "../../i18n";
import { SHAPE_CHOICES, useArmedShape } from "./shapeChoices";

export default function ShapesFlyout({ onClose }: { onClose: () => void }) {
  const t = useT();
  const armed = useArmedShape((s) => s.id);
  const ref = useRef<HTMLDivElement>(null);
  useMenuKeys(ref); // useEscClose 보다 먼저(U3 NodeMenu 주석 참고)
  useEscClose(onClose);
  return (
    <div ref={ref} data-testid="shapes-flyout" role="menu" aria-label={t("Shapes")} onPointerDown={(e) => e.stopPropagation()}
      style={{ ...menuBox, left: "calc(100% + 10px)", top: 80, minWidth: 150 }}>
      {SHAPE_CHOICES.map((c) => (
        <Item key={c.id} label={c.label} data-testid={`shape-${c.id}`} extra={armed === c.id ? "✓" : undefined}
          onClick={() => { useArmedShape.getState().set(c.id); onClose(); }} />
      ))}
    </div>
  );
}
