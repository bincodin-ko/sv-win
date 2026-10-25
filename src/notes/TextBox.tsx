// S-844·S-845·S-848: 텍스트 상자. 너비만 조절하고 높이는 글에 맞춘다. 글자색 = stroke(S-846)
import { useLayoutEffect, useRef, useState } from "react";
import { useScope } from "../board/BoardScope";
import { inkVar } from "../board/ink-colors";
import { fontStack, sizePx } from "../board/shapes/textStyle";
import { editNow, finishText, useEditing } from "./editing";

const PAD_Y = 2, PAD_X = 4;

export default function TextNode({ id }: { id: string }) {
  const { store } = useScope();
  const n = store((s) => s.nodes[id]) as Record<string, any> | undefined;
  const editing = useEditing((s) => s.id === id);
  const [draft, setDraft] = useState<string | null>(null); // 편집 중 글(null = 노드 글)
  const mirror = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const shown = (editing ? draft : null) ?? (n?.text as string | undefined) ?? "";
  const w = n?.w, font = n?.font, size = n?.size;

  useLayoutEffect(() => { // 높이는 글에 맞춘다(되돌리기 단계를 만들지 않는다)
    const m = mirror.current;
    if (!m) return;
    const h = Math.ceil(m.offsetHeight) + PAD_Y * 2, cur = store.getState().nodes[id];
    if (cur && Math.abs(cur.h - h) > 0.5) store.getState().updateNode(id, { h });
  }, [store, id, shown, w, font, size]);

  useLayoutEffect(() => {
    if (!editing) { setDraft(null); return; }
    const t = setTimeout(() => { const el = ta.current; if (el && document.activeElement !== el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 0); // 놓은 클릭의 기본 포커스 이동 뒤에
    return () => clearTimeout(t);
  }, [editing]);

  if (!n) return null;
  const fs = sizePx(n.size);
  const type: React.CSSProperties = {
    boxSizing: "border-box", margin: 0, fontFamily: fontStack(n.font), fontSize: fs, lineHeight: 1.25, color: inkVar(n.stroke), textAlign: (n.align ?? "left") as "left",
    whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: `${PAD_Y}px ${PAD_X}px`,
  };
  const mirrorText = shown.endsWith("\n") ? shown + " " : shown;
  return (
    <div data-testid="text-body" onDoubleClick={(e) => { e.stopPropagation(); editNow(id, e.currentTarget); }}
      style={{ position: "relative", width: "100%", height: "100%", opacity: (n.opacity ?? 100) / 100 }}>
      <div ref={mirror} data-testid="text-text" style={{ ...type, minHeight: fs * 1.25, visibility: editing ? "hidden" : "visible" }}>{mirrorText}</div>
      {editing && (
        <textarea ref={ta} data-testid="text-input" defaultValue={(n.text as string) ?? ""} spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => finishText(store, id, e.currentTarget.value, { vanishIfEmpty: true })}
          onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); e.currentTarget.blur(); } }}
          style={{ ...type, position: "absolute", inset: 0, width: "100%", height: "100%", background: "none", border: "none", outline: "1px dashed var(--accent)", resize: "none", overflow: "hidden" }} />
      )}
    </div>
  );
}
