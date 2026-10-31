// 107번: iframe 을 막는 사이트(유튜브·구글)는 타일 자리에 진짜 웹뷰(tile-<id>)를 겹친다.
// 진짜 웹뷰는 항상 앱 화면 위에 그려지므로, 타일이 가려졌으면(메뉴·창·크게 보기·다른 타일) 숨긴다.
import { useEffect, useRef, type RefObject } from "react";
import { webChildClose, webChildOpen, webChildPlace } from "../lib/ipc";

/** 사각형의 가운데·네 귀퉁이(12px 안쪽, 크기 손잡이 피함) 중 창 안에 있는 점이 모두 pane 안의 요소면 안 가려진 것. 창 안 점이 하나도 없으면 false */
export function unobstructed(pane: Element, r: { left: number; top: number; right: number; bottom: number }, at: (x: number, y: number) => Element | null, vw: number, vh: number): boolean {
  const pts = [[(r.left + r.right) / 2, (r.top + r.bottom) / 2], [r.left + 12, r.top + 12], [r.right - 12, r.top + 12], [r.left + 12, r.bottom - 12], [r.right - 12, r.bottom - 12]];
  const inside = pts.filter(([x, y]) => x! >= 0 && y! >= 0 && x! < vw && y! < vh);
  return inside.length > 0 && inside.every(([x, y]) => { const e = at(x!, y!); return !!e && pane.contains(e); });
}

/** 떠 있는 메뉴·창·목록·앱 틀 중 하나라도 타일과 겹치면 true(가운데·귀퉁이 점이 못 잡는 작은 메뉴용) */
export function overlayHits(r: { left: number; top: number; right: number; bottom: number }, overlays: { left: number; top: number; right: number; bottom: number }[]): boolean {
  return overlays.some((o) => o.right > r.left && o.left < r.right && o.bottom > r.top && o.top < r.bottom);
}
// data-chrome = 보드 위에 떠 있는 앱 틀(왼쪽·오른쪽 도구, 명령 줄, 줌, 위 막대). 설치본 실측: 점 5개로는 타일 가장자리에 걸친 도구 막대를 못 잡아 웹뷰가 덮었다
const OVERLAYS = '[role="menu"], [role="dialog"], [role="listbox"], [role="tooltip"], [data-chrome]';

// ponytail: 열린 동안 매 프레임 자리를 잰다(바뀔 때만 IPC). 보드 이동 알림을 받게 되면 구독으로 바꾼다
export function useNativeWeb(host: RefObject<HTMLElement | null>, id: string, url: string, enabled: boolean, show: boolean): void {
  const showRef = useRef(show);
  showRef.current = show;
  useEffect(() => {
    if (!enabled || !url) return;
    let dead = false, raf = 0, last = "";
    void webChildOpen(id, url).then(() => { last = ""; }, () => {}); // 만들기가 끝나기 전 자리 알림은 버려진다(설치본 실측: 타일을 움직여야 떴다) → 끝나면 다시 보낸다
    const tick = () => {
      if (dead) return;
      const el = host.current, pane = el?.closest('[data-testid="web-pane"]');
      const r = el?.getBoundingClientRect();
      const zoom = el && el.offsetWidth ? Math.round((r!.width / el.offsetWidth) * 100) / 100 : 1;
      const on = !!(showRef.current && el && pane && r && r.width > 1 && unobstructed(pane, r, (x, y) => document.elementFromPoint(x, y), innerWidth, innerHeight)
        && !overlayHits(r, [...document.querySelectorAll(OVERLAYS)].filter((o) => !pane.contains(o)).map((o) => o.getBoundingClientRect())));
      const p = { x: Math.round(r?.left ?? 0), y: Math.round(r?.top ?? 0), w: Math.round(r?.width ?? 0), h: Math.round(r?.height ?? 0), zoom, show: on };
      const key = on ? `${p.x},${p.y},${p.w},${p.h},${zoom}` : "hide";
      if (key !== last) { last = key; void webChildPlace(id, p).catch(() => {}); }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { dead = true; cancelAnimationFrame(raf); void webChildClose(id).catch(() => {}); };
  }, [host, id, url, enabled]);
}
