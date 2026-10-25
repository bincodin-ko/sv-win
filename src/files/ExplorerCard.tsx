// S-962·S-964: 코드 탐색기 카드. 놓는 순간의 파일 목록(최대 40) + 선택한 파일의 읽기 전용 강조 보기.
import { useEffect, useState } from "react";
import { useScope } from "../board/BoardScope";
import { fileText, type FileTextResult } from "../lib/ipc";
import { cardStyle, CodeLines, headStyle, titleStyle } from "./CodeView";
import { clipLines } from "./clip";
import { langOf } from "./highlight";
import { baseName, EXPLORER_MAX } from "./make";
import { tp, useT } from "../i18n";

export default function ExplorerCard({ id }: { id: string }) {
  const t = useT();
  const { store: useBoard } = useScope();
  const node = useBoard((s) => s.nodes[id]);
  const files = ((node?.files as string[] | undefined) ?? []).slice(0, EXPLORER_MAX);
  const selected = (node?.selected as string | undefined) ?? "";
  const [res, setRes] = useState<{ path: string; r: FileTextResult } | null>(null);
  useEffect(() => {
    if (!selected) return;
    let dead = false;
    fileText(selected).then((r) => { if (!dead) setRes({ path: selected, r }); }, (e) => { if (!dead) setRes({ path: selected, r: { kind: "error", message: String(e) } }); });
    return () => { dead = true; };
  }, [selected]);
  if (!node) return null;
  const pick = (p: string) => useBoard.getState().updateNode(id, { selected: p }); // 보기 선택은 되돌리기에 안 넣는다
  const cur = res?.path === selected ? res.r : null;
  return (
    <div data-testid="explorer-card" style={cardStyle}>
      <div data-node-handle style={headStyle}>
        <span data-testid="explorer-title" title={node.dir as string} style={titleStyle}>{(node.name as string | undefined) ?? baseName((node.dir as string) ?? "")}</span>
        <span style={{ color: "var(--mute-2)", font: "11px system-ui" }}>{tp("{n} file", "{n} files", files.length)}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <div data-wheel-own style={{ flex: "none", width: 170, overflow: "auto", borderRight: "1px solid var(--bd)", padding: "4px 0" }}>
          {files.length === 0 && <div style={{ padding: "6px 10px", color: "var(--mute-3)" }}>{t("No text files")}</div>}
          {files.map((p) => (
            <div key={p} data-testid="ex-file" data-path={p} data-selected={p === selected ? "true" : "false"} title={p} onClick={() => pick(p)}
              style={{ padding: "3px 10px", cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", background: p === selected ? "var(--surface-2)" : undefined, color: p === selected ? "var(--fg)" : "var(--fg-3)" }}>
              {baseName(p)}
            </div>
          ))}
        </div>
        <div data-testid="ex-view" data-wheel-own style={{ flex: 1, minWidth: 0, overflow: "auto" }}>
          {cur?.kind === "text" ? <CodeLines text={clipLines(cur.text).text} lang={langOf(selected)} />
            : cur ? <div style={{ padding: 10, color: "var(--mute-2)" }}>{t("Can't show this file")}</div> : null}
        </div>
      </div>
    </div>
  );
}
