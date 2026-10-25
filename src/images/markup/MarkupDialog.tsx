// S-885~S-888: Markup 편집창. 원본 해상도 캔버스에 그리고 창 크기에 맞춰 축소 표시. 저장은 새 PNG(원본 불변)
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModal } from "../../ui/useModal";
import { composeMarkup, paintCommands } from "./compose";
import { MARKUP_COLORS, MARKUP_WIDTHS } from "./colors";
import { allCommands, clearAll, elementCommands, popLast, textSize, type MarkEl, type Pt, type Tool } from "./draw";
import { tm, useT } from "../../i18n";

const TOOLS: [Tool, string][] = [["arrow", tm("Arrow")], ["rectangle", tm("Rectangle")], ["ellipse", tm("Ellipse")], ["line", tm("Line")], ["pen", tm("Pen")], ["highlight", tm("Highlight")], ["text", tm("Text")]];
const btn = (on = false): React.CSSProperties => ({ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--bd-2)", background: on ? "var(--accent)" : "var(--surface-2)", color: on ? "var(--accent-ink)" : "var(--fg-2)", font: "12px system-ui", cursor: "pointer" });

export default function MarkupDialog({ url, nw, nh, onSave, onCancel }: { url: string; nw: number; nh: number; onSave: (png: Uint8Array) => Promise<void>; onCancel: () => void }) {
  const t = useT();
  const [tool, setTool] = useState<Tool>("arrow");
  const [ci, setCi] = useState(0);
  const [wi, setWi] = useState(1);
  const [els, setEls] = useState<MarkEl[]>([]);
  const [draft, setDraft] = useState<MarkEl | null>(null);
  const [textAt, setTextAt] = useState<{ pt: Pt; left: number; top: number } | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const textDone = useRef(false);
  const scale = Math.max(1, Math.max(nw, nh) / 800); // 큰 그림은 굵기·글자도 그만큼 크게
  const box = useRef<HTMLDivElement>(null);
  useModal(box, { onClose: onCancel });

  useEffect(() => {
    const im = new Image();
    im.src = url;
    void im.decode().then(() => setImg(im), () => {});
  }, [url]);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx || !img) return;
    ctx.clearRect(0, 0, nw, nh);
    ctx.drawImage(img, 0, 0);
    paintCommands(ctx, allCommands(draft ? [...els, draft] : els, scale));
  }, [img, els, draft, nw, nh, scale]);
  useEffect(() => { // Ctrl+Z = 마지막 하나(글자 입력 중이면 입력란 몫)
    const k = (e: KeyboardEvent) => {
      if (!(e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "z") || (e.target as Element).closest?.("input")) return;
      e.preventDefault();
      e.stopPropagation();
      setEls(popLast);
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, []);

  const toPt = (e: React.PointerEvent): Pt => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * nw) / r.width, y: ((e.clientY - r.top) * nh) / r.height };
  };
  const down = (e: React.PointerEvent) => {
    if (busy || textAt) return;
    const pt = toPt(e);
    if (tool === "text") {
      e.preventDefault(); // 누른 뒤 포커스가 body 로 옮겨 입력란이 바로 blur 되지 않게
      const w = wrap.current!.getBoundingClientRect();
      textDone.current = false;
      return setTextAt({ pt, left: e.clientX - w.left, top: e.clientY - w.top });
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraft({ tool, color: MARKUP_COLORS[ci]![1], width: MARKUP_WIDTHS[wi]!, pts: [pt] });
  };
  const move = (e: React.PointerEvent) => {
    if (!draft) return;
    const pt = toPt(e);
    setDraft((d) => d && { ...d, pts: d.tool === "pen" || d.tool === "highlight" ? [...d.pts, pt] : [d.pts[0]!, pt] });
  };
  const up = () => {
    if (draft && elementCommands(draft).length) setEls((l) => [...l, draft]);
    setDraft(null);
  };
  const commitText = (value: string) => {
    if (textDone.current || !textAt) return;
    textDone.current = true;
    if (value.trim()) setEls((l) => [...l, { tool: "text", color: MARKUP_COLORS[ci]![1], width: MARKUP_WIDTHS[wi]!, pts: [textAt.pt], text: value }]);
    setTextAt(null);
  };
  const save = async () => {
    if (busy || !img) return;
    setBusy(true);
    try { await onSave(await composeMarkup({ image: img, nw, nh, elements: els, scale })); } finally { setBusy(false); }
  };
  const shown = canvas.current ? canvas.current.getBoundingClientRect().width / nw : 1;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 20000, display: "grid", placeItems: "center", background: "var(--scrim)" }} onPointerDown={(e) => e.stopPropagation()}>
      <div ref={box} role="dialog" aria-modal="true" aria-label={t("Markup")} style={{ maxWidth: "94vw", maxHeight: "94vh", padding: 14, display: "grid", gap: 10, borderRadius: 10, background: "var(--panel)", color: "var(--text)", border: "1px solid var(--border)", font: "13px system-ui" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {TOOLS.map(([id, label]) => <button key={id} data-testid={`mk-tool-${id}`} aria-pressed={tool === id} onClick={() => setTool(id)} style={btn(tool === id)}>{t(label)}</button>)}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {MARKUP_COLORS.map(([name, hex], i) => (
              <button key={name} data-testid={`mk-color-${i}`} aria-label={t(name)} aria-pressed={ci === i} title={t(name)} onClick={() => setCi(i)}
                style={{ width: 20, height: 20, borderRadius: "50%", padding: 0, cursor: "pointer", background: hex, border: ci === i ? "2px solid var(--accent)" : "1px solid var(--bd-2)" }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {MARKUP_WIDTHS.map((w, i) => (
              <button key={w} data-testid={`mk-width-${i}`} aria-label={t("Width {w}", { w })} aria-pressed={wi === i} title={t("Width {w}", { w })} onClick={() => setWi(i)}
                style={{ width: 24, height: 24, padding: 0, borderRadius: 6, cursor: "pointer", display: "grid", placeItems: "center", background: wi === i ? "var(--surface-2)" : "transparent", border: wi === i ? "1px solid var(--accent)" : "1px solid var(--bd-2)" }}>
                <span style={{ width: 4 + i * 3, height: 4 + i * 3, borderRadius: "50%", background: "var(--fg-2)" }} />
              </button>
            ))}
          </div>
        </div>
        <div ref={wrap} style={{ position: "relative", justifySelf: "center", lineHeight: 0 }}>
          <canvas ref={canvas} data-testid="mk-canvas" data-count={els.length} width={nw} height={nh}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            style={{ maxWidth: "min(1200px, 90vw)", maxHeight: "calc(94vh - 150px)", background: "var(--well)", cursor: "crosshair", touchAction: "none", borderRadius: 4 }} />
          {textAt && (
            <input data-testid="mk-text-input" autoFocus onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); commitText(e.currentTarget.value); } }}
              onBlur={(e) => commitText(e.currentTarget.value)}
              style={{ position: "absolute", left: textAt.left, top: textAt.top, minWidth: 40, width: 160, padding: 0, border: "1px dashed var(--accent)", background: "transparent", outline: "none", font: `bold ${Math.max(10, textSize(MARKUP_WIDTHS[wi]!) * scale * shown)}px system-ui`, lineHeight: 1.1, color: MARKUP_COLORS[ci]![1] }} />
          )}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
          <button data-testid="mk-clear" onClick={() => setEls(clearAll)} style={btn()}>{t("Clear all")}</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button data-testid="mk-save" disabled={busy || !img} onClick={() => void save()} style={{ ...btn(true), fontWeight: 600 }}>{t("Save markup")}</button>
            <button data-testid="mk-cancel" onClick={onCancel} style={btn()}>{t("Cancel")}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
