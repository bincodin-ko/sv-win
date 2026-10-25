// S-881·S-882·S-885: 이미지 노드 본체. 그림은 Blob URL, 파일이 없으면 "Image missing", 선택하면 위쪽 가운데에 Markup pill
import { useState } from "react";
import { useScope } from "../board/BoardScope";
import { imageSave } from "../lib/ipc";
import MarkupDialog from "./markup/MarkupDialog";
import { markupName } from "./markup/names";
import { useImageSrc } from "./useImageSrc";
import { useT } from "../i18n";

export default function ImageNode({ id }: { id: string }) {
  const t = useT();
  const { store: useBoard } = useScope();
  const n = useBoard((s) => s.nodes[id]);
  const only = useBoard((s) => s.selection.length === 1 && s.selection[0] === id);
  const [open, setOpen] = useState(false);
  const src = (n?.shot ?? n?.path) as string | undefined;
  const im = useImageSrc(src);
  if (!n) return null;

  const save = async (png: Uint8Array) => {
    const shot = await imageSave(png, markupName(src!));
    const s = useBoard.getState();
    s.commit(); // 되돌리기 1단계
    s.updateNode(id, { shot, path: undefined }); // 원본 파일은 건드리지 않는다
    setOpen(false);
  };
  return (
    <div data-testid="image-body" style={{ position: "relative", width: "100%", height: "100%" }}>
      <div style={{ width: "100%", height: "100%", overflow: "hidden", borderRadius: 10 }}>
        {im.state === "ok" ? (
          <img data-testid="image-img" src={im.url} alt="" draggable={false} style={{ display: "block", width: "100%", height: "100%", objectFit: "fill", pointerEvents: "none", userSelect: "none" }} />
        ) : im.state === "missing" ? (
          <div data-testid="image-missing" style={{ width: "100%", height: "100%", boxSizing: "border-box", display: "grid", alignContent: "center", justifyItems: "center", gap: 6, padding: 12, border: "1px dashed var(--bd-2)", borderRadius: 10, background: "var(--well)", color: "var(--fg-3)", font: "13px system-ui", textAlign: "center" }}>
            <b style={{ color: "var(--fg-2)" }}>{t("Image missing")}</b>
            <span data-testid="image-missing-path" style={{ font: "11px system-ui", wordBreak: "break-all" }}>{src}</span>
          </div>
        ) : null}
      </div>
      {only && im.state === "ok" && (
        <button data-testid="image-markup" onClick={() => setOpen(true)} onDoubleClick={(e) => e.stopPropagation()}
          style={{ position: "absolute", left: "50%", top: -36, transform: "translateX(-50%)", padding: "4px 12px", borderRadius: 14, border: "1px solid var(--bd)", background: "var(--surface)", color: "var(--fg-2)", font: "12px system-ui", cursor: "pointer", whiteSpace: "nowrap" }}>✎ {t("Markup")}</button>
      )}
      {open && im.state === "ok" && <MarkupDialog url={im.url} nw={im.nw} nh={im.nh} onSave={save} onCancel={() => setOpen(false)} />}
    </div>
  );
}
