// S-840~S-843: 스티커 노트. 접힌 모서리(오른쪽 아래)를 누르면 종이 색이 바뀐다. 더블클릭하면 글을 다시 편집한다
import { useEffect, useRef, useState } from "react";
import { useScope } from "../board/BoardScope";
import { editNow, finishText, useEditing } from "./editing";
import { STICKY_PAD, fitFontSize, nextPaper, paperVar } from "./sticky";

const FOLD = 28;
const textStyle = (size: number): React.CSSProperties => ({
  position: "absolute", inset: STICKY_PAD, boxSizing: "border-box", margin: 0, padding: 0, border: "none", background: "none", outline: "none", resize: "none",
  font: "inherit", fontFamily: '"Segoe UI", system-ui, sans-serif', fontSize: size, lineHeight: 1.3, color: "var(--paper-ink)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", overflowY: "auto", textAlign: "left",
});

function Editor({ id, text, box }: { id: string; text: string; box: { w: number; h: number } }) {
  const { store } = useScope();
  const [draft, setDraft] = useState(text);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    // 바로 잡는다(늦게 잡으면 놓은 직후 친 첫 글자가 보드 단축키로 간다). 놓은 클릭의 기본 포커스 이동이 뺏어 가면 다음 틱에 다시 잡는다
    const grab = () => { const el = ref.current; if (el && document.activeElement !== el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } };
    grab();
    const t = setTimeout(grab, 0);
    return () => clearTimeout(t);
  }, []);
  return (
    <textarea ref={ref} data-testid="sticky-input" value={draft} spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => finishText(store, id, e.currentTarget.value, { vanishIfEmpty: false })}
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); e.currentTarget.blur(); } }}
      style={textStyle(fitFontSize(draft, box))} />
  );
}

export default function Sticky({ id }: { id: string }) {
  const { store } = useScope();
  const n = store((s) => s.nodes[id]) as Record<string, any> | undefined;
  const editing = useEditing((s) => s.id === id);
  if (!n) return null;
  const box = { w: n.w, h: n.h }, text = (n.text as string) ?? "";
  return (
    <div data-testid="sticky-body" onDoubleClick={(e) => { e.stopPropagation(); editNow(id, e.currentTarget); }}
      style={{ position: "relative", width: "100%", height: "100%", background: paperVar(n.color), borderRadius: 2, boxShadow: "0 6px 14px var(--paper-shadow)", overflow: "hidden" }}>
      {editing ? <Editor id={id} text={text} box={box} /> : (
        <div data-testid="sticky-text" style={{ ...textStyle(fitFontSize(text, box)), cursor: "default" }}>{text}</div>
      )}
      <button data-testid="sticky-fold" title="Change color" aria-label="Change paper color"
        onDoubleClick={(e) => e.stopPropagation()}
        onClick={() => { const s = store.getState(); s.commit(); s.updateNode(id, { color: nextPaper(n.color) }); }}
        style={{ position: "absolute", right: 0, bottom: 0, width: FOLD, height: FOLD, padding: 0, border: "none", cursor: "pointer", background: "linear-gradient(315deg, var(--panel) 50%, var(--paper-fold) 50%)" }} />
    </div>
  );
}
