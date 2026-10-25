// E6 S-1991·S-1981: 미리보기. Flow = 흰 종이 위 렌더된 글(C4 렌더러 + S-1848 콜아웃), Pages = E2 previewPdf 의 blob PDF 를 iframe 으로
import { useEffect, useMemo } from "react";
import { useT } from "../../i18n";
import { MD_CSS, view } from "../../files/MarkdownCard";
import { renderMarkdown } from "../../files/markdown";
import { calloutOf } from "../../pdf/callout";
import type { ExportOpts } from "../../pdf/exportPdf";
import { previewPdf } from "../../pdf/preview";
import { useState } from "react";

const PAPER = {
  "--fg": "var(--doc-ink)", "--bd": "var(--doc-line)", "--bd-2": "var(--doc-line)", "--well": "var(--doc-well)", "--surface-2": "var(--doc-well)", "--mute-2": "var(--doc-ink-dim)", "--accent-text": "var(--doc-accent)",
  background: "var(--doc-paper)", color: "var(--doc-ink)",
} as React.CSSProperties;
const CSS = `.doc-callout{margin:.7em 0;padding:8px 12px;background:var(--doc-note-bg);border-left:3px solid var(--doc-note-bar);border-radius:4px}.doc-callout>b{display:block;font-size:11px;letter-spacing:.06em;color:var(--doc-note-bar);margin-bottom:2px}.doc-callout p{margin:.2em 0}`;

/** 흐르는 종이. 인용 블록이 Note 표식으로 시작하면 콜아웃(맨 위 단계의 블록만 — ponytail: 중첩 인용 안의 콜아웃은 일반 인용) */
export function Flow({ md, testid = "doc-flow" }: { md: string; testid?: string }) {
  const nodes = useMemo(() => renderMarkdown(md, { allowImage: () => false }), [md]);
  return (
    <div data-testid={testid} className="md-body" style={{ ...PAPER, padding: "28px 36px", minHeight: "100%", boxSizing: "border-box" }}>
      <style>{MD_CSS}{CSS}</style>
      {nodes.map((n, i) => {
        const c = n.type === "el" && n.tag === "blockquote" ? calloutOf(n.children) : null;
        return c ? <aside key={i} data-testid="doc-callout" className="doc-callout"><b>{c.label}</b>{view(c.body, "")}</aside> : <div key={i}>{view([n], "")}</div>;
      })}
    </div>
  );
}

/** 회색 줄 뼈대(S-1981: 첫 글이 오기 전) */
export function Skeleton() {
  const bar = (w: string, h = 10) => <div style={{ width: w, height: h, borderRadius: 4, background: "var(--doc-skel)", margin: "10px 0" }} />;
  return <div data-testid="doc-skeleton" style={{ ...PAPER, padding: "28px 36px", minHeight: "100%", boxSizing: "border-box" }}>{bar("45%", 20)}{bar("95%")}{bar("88%")}{bar("92%")}{bar("60%")}{bar("30%", 16)}{bar("90%")}{bar("75%")}</div>;
}

/** 쪽 미리보기: 같은 HTML 의 PDF 를 iframe 에. 만들 수 없으면 onFail(이유) — 부모가 Pages 를 끈다 */
export function Pages({ opts, onFail }: { opts: Omit<ExportOpts, "toast">; onFail: (why: string) => void }) {
  const t = useT();
  const [url, setUrl] = useState<string | null>(null);
  const key = JSON.stringify(opts);
  useEffect(() => {
    let dead = false;
    setUrl(null);
    previewPdf(opts).then(
      (u) => !dead && (u ? setUrl(u) : onFail(t("Microsoft Edge was not found"))),
      (e) => !dead && onFail(String(e)),
    );
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url
    ? <iframe data-testid="doc-pages" title={t("Pages preview")} src={url} style={{ flex: 1, width: "100%", minHeight: 0, border: 0, background: "var(--doc-paper)" }} />
    : <div data-testid="doc-pages-loading" style={{ ...PAPER, flex: 1, padding: 24, color: "var(--doc-ink-dim)" }}>{t("Building pages…")}</div>;
}
