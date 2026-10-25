// S-957·S-958·S-964: 코드 카드. 놓는 순간의 읽기 전용 사본(text 는 노드에 저장). 머리줄만 끌린다.
import { useMemo, useState } from "react";
import { useScope } from "../board/BoardScope";
import { clipLines, CUT_NOTICE } from "./clip";
import { btnStyle, cardStyle, CodeLines, headStyle, titleStyle } from "./CodeView";
import { langOf } from "./highlight";
import { useT } from "../i18n";

export default function CodeCard({ id }: { id: string }) {
  const t = useT();
  const { store: useBoard } = useScope();
  const node = useBoard((s) => s.nodes[id]);
  const [copied, setCopied] = useState(false);
  const text = (node?.text as string | undefined) ?? "";
  const path = (node?.path as string | undefined) ?? "";
  const clip = useMemo(() => clipLines(text), [text]);
  const lang = useMemo(() => langOf(path), [path]);
  if (!node) return null;
  const cut = clip.cut || node.truncated === true;
  const copy = () => void navigator.clipboard.writeText(clip.text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }, () => {});
  return (
    <div data-testid="code-card" style={cardStyle}>
      <div data-node-handle style={headStyle}>
        <span data-testid="code-title" title={path} style={titleStyle}>{(node.name as string | undefined) ?? path}</span>
        <button data-testid="code-copy" style={btnStyle} onClick={copy}>{copied ? t("Copied") : t("Copy")}</button>
      </div>
      <div data-wheel-own style={{ flex: 1, minHeight: 0, overflow: "auto" }}><CodeLines text={clip.text} lang={lang} /></div>
      {cut && <div data-testid="code-notice" style={{ flex: "none", padding: "4px 10px", borderTop: "1px solid var(--bd)", color: "var(--mute-2)", font: "11px system-ui" }}>{t(CUT_NOTICE)} {t("(Copy copies these lines only)")}</div>}
    </div>
  );
}
