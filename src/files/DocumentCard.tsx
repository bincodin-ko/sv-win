// E6 S-1993: Document 카드. 만든 순간의 복사본(title·md·agent·date·incomplete·repo) — 스튜디오 글을 따라가지 않는다. 머리줄 제목, 본문 렌더, 자체 Export PDF(E2)
import { useScope } from "../board/BoardScope";
import { useExporter } from "../studio/documents/exporter";
import { Flow } from "../studio/documents/Preview";
import { btnStyle, cardStyle, headStyle, titleStyle } from "./CodeView";
import { useT } from "../i18n";

export default function DocumentCard({ id }: { id: string }) {
  const t = useT();
  const { store: useBoard } = useScope();
  const node = useBoard((s) => s.nodes[id]);
  const exp = useExporter();
  if (!node) return null;
  const f = node as unknown as { title?: string; md?: string; agent?: string; date?: string; incomplete?: boolean; repo?: string };
  return (
    <div data-testid="document-card" style={cardStyle}>
      <div data-node-handle style={headStyle}>
        <span data-testid="document-card-title" title={f.title} style={titleStyle}>{f.title}</span>
        {f.incomplete && <span style={{ ...btnStyle, cursor: "default", color: "var(--warn)" }}>{t("Incomplete")}</span>}
        <button data-testid="document-card-export" style={{ ...btnStyle, background: "var(--accent)", color: "var(--accent-text)", border: 0 }}
          onClick={() => void exp.go({ title: f.title ?? "document", agent: f.agent, repo: f.repo ?? "", date: f.date ?? "", md: f.md ?? "", draft: f.incomplete })}>{t("Export PDF")}</button>
      </div>
      <div data-wheel-own style={{ flex: 1, minHeight: 0, overflow: "auto" }}><Flow md={f.md ?? ""} testid="document-card-body" /></div>
      {exp.toast}
    </div>
  );
}
