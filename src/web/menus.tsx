// 웹 타일 메뉴: 기기 크기(S-1108)와 More(S-1106). 바깥을 누르거나 Esc 로 닫힌다.
import { useEffect, useRef } from "react";
import { Item, menuBox, useEscClose, useMenuKeys } from "../board/menus/menuKit";
import { DEVICES } from "./devices";
import { ZOOMS } from "./zoom";
import { tm, useT } from "../i18n";

const Check = () => <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 5l3 3 5-6" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>;
const head: React.CSSProperties = { font: "600 10px system-ui", color: "var(--mute)", padding: "6px 8px 2px", letterSpacing: 0.5 };
const sep = <div style={{ height: 1, background: "var(--bd)", margin: "4px 0" }} />;

function Menu({ onClose, style, children }: { onClose: () => void; style?: React.CSSProperties; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useMenuKeys(ref); // useEscClose 보다 먼저(U3 NodeMenu 주석 참고)
  useEscClose(onClose);
  useEffect(() => {
    const d = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    window.addEventListener("pointerdown", d, true);
    return () => window.removeEventListener("pointerdown", d, true);
  }, [onClose]);
  return <div ref={ref} role="menu" onPointerDown={(e) => e.stopPropagation()} style={{ ...menuBox, top: "100%", right: 0, marginTop: 4, ...style }}>{children}</div>;
}

export function DeviceMenu({ device, onPick, onClose }: { device: string | null; onPick: (id: string | null) => void; onClose: () => void }) {
  const t = useT();
  const pick = (id: string | null) => () => { onPick(id); onClose(); };
  return (
    <Menu onClose={onClose}>
      <Item label={t("Fit tile")} data-checked={String(device == null)} extra={device == null ? <Check /> : undefined} onClick={pick(null)} />
      {([tm("DISPLAYS"), tm("PHONES")] as const).map((g) => (
        <div key={g}>
          <div style={head}>{t(g)}</div>
          {DEVICES.filter((d) => d.group === g).map((d) => (
            <Item key={d.id} label={d.label} data-checked={String(device === d.id)} extra={`${d.w}×${d.h}`} onClick={pick(d.id)} />
          ))}
        </div>
      ))}
    </Menu>
  );
}

export function MoreMenu({ zoom, onZoom, onInspect, onHard, onCopy, onOpen, onClose }: {
  zoom: number; onZoom: (z: number) => void; onInspect: () => void; onHard: () => void; onCopy: () => void; onOpen: () => void; onClose: () => void;
}) {
  const t = useT();
  const run = (f: () => void) => () => { f(); onClose(); };
  return (
    <Menu onClose={onClose}>
      <div style={head}>{t("PAGE ZOOM")}</div>
      <div data-wheel-own style={{ maxHeight: 150, overflowY: "auto" }}>
        {ZOOMS.map((z) => <Item key={z} label={`${z}%`} data-checked={String(z === zoom)} extra={z === zoom ? <Check /> : undefined} onClick={run(() => onZoom(z))} />)}
      </div>
      {sep}
      <Item label={t("Inspect on board")} onClick={run(onInspect)} />
      <Item label={t("Hard reload (skip cache)")} onClick={run(onHard)} />
      <Item label={t("Copy URL")} onClick={run(onCopy)} />
      <Item label={t("Open in Browser")} onClick={run(onOpen)} />
    </Menu>
  );
}
