// 남은일 468번: 채팅 패널을 보드 줌(CSS scale) 밖(body)에 그린다 — 줄여 그린 그림이라 글자가 흐렸고, 휠은 보드가 가져갔다.
// 자리 표시(anchor) 칸의 화면 위치를 매 프레임 따라가고, 보드 배율은 CSS zoom 으로 줘서 글자를 그 크기로 새로 그린다.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// ponytail: 열린 동안 매 프레임 자리를 잰다(바뀔 때만 다시 그림). 보드 이동 알림을 받게 되면 구독으로 바꾼다
export default function ChatDock({ style, children }: { style: React.CSSProperties; children: ReactNode }) {
  const anchor = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number; k: number } | null>(null);
  useEffect(() => {
    let raf = 0, last = "";
    const tick = () => {
      const el = anchor.current;
      const r = el?.getBoundingClientRect();
      const k = el && el.offsetWidth ? r!.width / el.offsetWidth : 1;
      const vis = !!el && el.getClientRects().length > 0 && r!.width > 1;
      const key = vis ? `${Math.round(r!.left)},${Math.round(r!.top)},${Math.round(r!.width)},${Math.round(r!.height)},${k.toFixed(3)}` : "";
      if (key !== last) { last = key; setBox(vis ? { x: r!.left, y: r!.top, w: r!.width, h: r!.height, k } : null); }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <>
      <div ref={anchor} data-testid="chat-anchor" style={{ ...style, pointerEvents: "none" }} />
      {box && createPortal(
        <div data-testid="chat-dock" style={{ position: "fixed", left: box.x, top: box.y, width: box.w, height: box.h, zIndex: 10 }}>
          <div style={{ width: box.w / box.k, height: box.h / box.k, zoom: box.k } as React.CSSProperties}>{children}</div>
        </div>,
        document.body,
      )}
    </>
  );
}
