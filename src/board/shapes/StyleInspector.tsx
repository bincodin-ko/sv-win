// S-825: 스타일 인스펙터. 선택이 도형·선(·텍스트)일 때 좌측 레일 옆에 열리고, 5절 중 선택에 맞는 절만 보인다
import { useRef } from "react";
import { useScope } from "../BoardScope";
import { INK_COLORS, inkVar } from "../ink-colors";
import { applyFields, commonValue, fieldsFor, sectionsFor, type Section } from "./inspectorFields";
import { FONTS, SIZES } from "./textStyle";
import { useT } from "../../i18n";

const row: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" };
const label: React.CSSProperties = { color: "var(--mute)", fontSize: 11, margin: "6px 0 3px" };

function Opt({ tid, on, children, onClick }: { tid: string; on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button data-testid={tid} data-on={on} onClick={onClick}
      style={{ padding: "3px 7px", border: `1px solid ${on ? "var(--accent)" : "var(--bd)"}`, borderRadius: 5, background: on ? "var(--surface-2)" : "none", color: "var(--fg-2)", font: "inherit", cursor: "pointer" }}>
      {children}
    </button>
  );
}
function Swatch({ tid, name, on, onClick }: { tid: string; name: string; on: boolean; onClick: () => void }) {
  const t = useT();
  const none = name === "transparent";
  return (
    <button data-testid={tid} data-on={on} title={t(name)} aria-label={t(name)} onClick={onClick}
      style={{ width: 20, height: 20, borderRadius: "50%", padding: 0, cursor: "pointer", background: none ? "var(--surface)" : inkVar(name), border: `2px solid ${on ? "var(--accent)" : "var(--bd-2)"}`, backgroundImage: none ? "linear-gradient(135deg, transparent 45%, var(--danger) 45%, var(--danger) 55%, transparent 55%)" : undefined }} />
  );
}

export default function StyleInspector() {
  const t = useT();
  const { store } = useScope();
  const selection = store((s) => s.selection);
  const all = store((s) => s.nodes);
  const gesture = useRef(false); // 슬라이더 끌기 한 번 = 되돌리기 1단계
  const sel = selection.flatMap((id) => (all[id] ? [all[id]!] : []));
  const secs = sectionsFor(sel);
  if (!secs.length) return null;
  const fields = fieldsFor(sel);
  const has = (f: string) => fields.includes(f);
  const val = (k: string) => commonValue(sel, k);
  const set = (patch: Record<string, unknown>) => applyFields(store, selection, patch);
  const sec = (s: Section, title: string, body: React.ReactNode) => secs.includes(s) && (
    <div data-testid={`insp-${s}`} style={{ padding: "6px 0", borderTop: "1px solid var(--bd)" }}>
      <div style={{ color: "var(--fg-3)", fontWeight: 600, marginBottom: 2 }}>{t(title)}</div>
      {body}
    </div>
  );
  const group = <T extends string | number>(key: string, name: string, tid: string, opts: [T, string][]) => (
    <>
      <div style={label}>{t(name)}</div>
      <div style={row}>{opts.map(([v, text]) => <Opt key={String(v)} tid={`insp-${tid}-${v}`} on={val(key) === v} onClick={() => set({ [key]: v })}>{t(text)}</Opt>)}</div>
    </>
  );
  const colors = (key: string, name: string, tid: string, withNone: boolean) => (
    <>
      <div style={label}>{t(name)}</div>
      <div style={row}>{(withNone ? ["transparent", ...INK_COLORS] : [...INK_COLORS]).map((c) => <Swatch key={c} tid={`insp-${tid}-${c}`} name={c} on={val(key) === c} onClick={() => set({ [key]: c })} />)}</div>
    </>
  );
  const opacity = (val("opacity") as number | undefined) ?? 100;
  const end = () => { gesture.current = false; };
  return (
    <div data-testid="style-inspector" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onContextMenu={(e) => { e.stopPropagation(); e.preventDefault(); }}
      style={{ position: "absolute", left: 68, top: 12, width: 210, overflowY: "auto", zIndex: 19, boxSizing: "border-box", padding: "6px 10px", background: "var(--surface)", border: "1px solid var(--bd)", borderRadius: 10, font: "12px system-ui", color: "var(--fg-2)", height: "fit-content", maxHeight: "calc(100% - 24px)" }}>
      {sec("lines", "Lines", <>
        {colors("stroke", "Stroke color", "stroke", false)}
        {has("strokeWidth") && group("strokeWidth", "Stroke width", "width", [[1, "Thin"], [2, "Bold"], [3, "Extra bold"]])}
        {has("strokeStyle") && group("strokeStyle", "Stroke style", "style", [["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]])}
        {has("roughness") && group("roughness", "Sloppiness", "rough", [[0, "Architect"], [1, "Artist"], [2, "Cartoonist"]])}
      </>)}
      {sec("fill", "Fill", <>
        {colors("fill", "Background color", "fill", true)}
        {has("fillStyle") && group("fillStyle", "Fill style", "fillstyle", [["hachure", "Hachure"], ["cross", "Cross-hatch"], ["solid", "Solid"]])}
      </>)}
      {sec("shape", "Shape", <>
        {has("edges") && group("edges", "Edges", "edges", [["sharp", "Sharp"], ["round", "Round"]])}
        <div style={label}>{t("Opacity {n}%", { n: opacity })}</div>
        <input data-testid="insp-opacity" type="range" min={10} max={100} step={1} value={opacity} style={{ width: "100%" }}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!gesture.current) { gesture.current = true; set({ opacity: v }); return; }
            const s = store.getState();
            selection.forEach((id) => s.updateNode(id, { opacity: v }));
          }}
          onPointerUp={end} onKeyUp={end} onBlur={end} />
      </>)}
      {sec("text", "Text", <>
        <div style={label}>{t("Font")}</div>
        <select data-testid="insp-font" value={(val("font") as string | undefined) ?? ""} onChange={(e) => set({ font: e.target.value })}
          style={{ width: "100%", background: "var(--surface-2)", color: "var(--fg-2)", border: "1px solid var(--bd)", borderRadius: 5, padding: 3 }}>
          {val("font") === undefined && <option value="" disabled>-</option>}
          {FONTS.map((f) => <option key={f.id} value={f.id}>{t(f.label)}</option>)}
        </select>
        {group("size", "Size", "size", (Object.keys(SIZES) as (keyof typeof SIZES)[]).map((s) => [s, s] as [string, string]))}
        {group("align", "Alignment", "align", [["left", "Left"], ["center", "Center"], ["right", "Right"]])}
      </>)}
      {sec("order", "Order", (
        <div style={row}>
          <Opt tid="insp-front" on={false} onClick={() => store.getState().bringToFront(selection)}>{t("Bring to front")}</Opt>
          <Opt tid="insp-back" on={false} onClick={() => store.getState().sendToBack(selection)}>{t("Send to back")}</Opt>
          <Opt tid="insp-dup" on={false} onClick={() => store.getState().duplicate(selection)}>{t("Duplicate")}</Opt>
          <Opt tid="insp-del" on={false} onClick={() => store.getState().removeNodes(selection)}>{t("Delete")}</Opt>
        </div>
      ))}
    </div>
  );
}
