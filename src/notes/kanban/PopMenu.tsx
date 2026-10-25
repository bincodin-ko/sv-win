// 칸반 메뉴 공용: 화면 고정(portal) 팝오버. 항목에 sub 가 있으면 눌렀을 때 같은 메뉴가 그 목록으로 바뀐다. Esc·바깥 누르기로 닫힌다.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Item, menuBox, useEscClose, useMenuKeys } from "../../board/menus/menuKit";

export type Entry = { label: string; extra?: string; run?: () => void; sub?: Entry[] };

/** portal 안의 이벤트가 React 트리를 타고 보드(팬·선택·고리 메뉴·더블클릭 맞춤)로 올라가지 않게 막는다 */
export const stopBoard = {
  onPointerDown: (e: React.SyntheticEvent) => e.stopPropagation(),
  onContextMenu: (e: React.SyntheticEvent) => { e.stopPropagation(); e.preventDefault(); },
  onDoubleClick: (e: React.SyntheticEvent) => e.stopPropagation(),
};

export default function PopMenu({ at, entries, onClose }: { at: { x: number; y: number }; entries: Entry[]; onClose: () => void }) {
  const [sub, setSub] = useState<Entry[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useMenuKeys(ref, sub); // useEscClose 보다 먼저(U3 NodeMenu 주석 참고)
  useEscClose(onClose);
  useEffect(() => {
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [onClose]);
  const list = sub ?? entries;
  const left = Math.min(at.x, window.innerWidth - 190), top = Math.min(at.y, window.innerHeight - 40 - list.length * 28);
  return createPortal(
    <div ref={ref} role="menu" {...stopBoard} style={{ ...menuBox, position: "fixed", zIndex: 20000, left: Math.max(4, left), top: Math.max(4, top) }}>
      {list.map((e) => (
        <Item key={e.label} label={e.label} extra={e.extra} onClick={() => (e.sub ? setSub(e.sub) : (onClose(), e.run?.()))} />
      ))}
    </div>,
    document.body,
  );
}
