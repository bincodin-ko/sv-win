// 5묶음 E5 S-1928: Source. 고정폭 <textarea> + 줄 번호 + md 강조(글자는 투명, 뒤 층에 tokenize "md" 로 칠한다). Ctrl+S 는 바로 저장.
import { useMemo, useRef } from "react";
import { useT } from "../../i18n";
import { Toks } from "../../files/CodeView";
import { tokenize } from "../../files/highlight";

const FONT = "13px/20px ui-monospace, Consolas, 'Cascadia Mono', monospace";
const PAD = 12;

export default function Source({ text, onChange, onSave }: { text: string; onChange: (t: string) => void; onSave: () => void }) {
  const t = useT();
  const hl = useRef<HTMLPreElement>(null), gut = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => tokenize(text, "md"), [text]);
  const digits = String(lines.length).length;
  const sync = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    if (hl.current) { hl.current.scrollTop = ta.scrollTop; hl.current.scrollLeft = ta.scrollLeft; }
    if (gut.current) gut.current.scrollTop = ta.scrollTop;
  };
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", background: "var(--well)" }}>
      <div ref={gut} aria-hidden data-testid="md-gutter" style={{ flex: "none", overflow: "hidden", padding: `${PAD}px 8px`, minWidth: `${digits}ch`, textAlign: "right", color: "var(--mute-3)", font: FONT, userSelect: "none", borderRight: "1px solid var(--studio-line)" }}>
        {lines.map((_, i) => <div key={i}>{i + 1}</div>)}
      </div>
      <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
        <pre ref={hl} aria-hidden style={{ position: "absolute", inset: 0, margin: 0, padding: PAD, overflow: "hidden", font: FONT, whiteSpace: "pre", color: "var(--fg)", pointerEvents: "none" }}>
          {lines.map((toks, i) => <span key={i}><Toks toks={toks} />{i < lines.length - 1 ? "\n" : ""}</span>)}
        </pre>
        <textarea data-testid="md-source" value={text} spellCheck={false} wrap="off" aria-label={t("Markdown source")}
          onChange={(e) => onChange(e.target.value)} onScroll={sync}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); onSave(); } }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", boxSizing: "border-box", margin: 0, padding: PAD, border: 0, outline: "none", resize: "none", overflow: "auto", background: "transparent", color: "transparent", caretColor: "var(--fg)", font: FONT, whiteSpace: "pre" }} />
      </div>
    </div>
  );
}
