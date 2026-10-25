// 5묶음 E5 S-1927: Reading. C4 renderMarkdown 을 Markdown 카드와 같은 그리기(view)로 보인다.
// 상대 .md 링크 = 스튜디오 안에서 열기(vault 에 없으면 글자 + "not found" 툴팁), http/https = 기본 브라우저(카드와 같다), [[위키 링크]] = 그냥 글자.
import { useMemo, type ReactNode } from "react";
import { useT } from "../../i18n";
import { MD_CSS, view, type LinkRender } from "../../files/MarkdownCard";
import { renderMarkdown } from "../../files/markdown";
import { dirOf, MISSING_LINK, OPEN_LINK, rewriteRelLinks } from "./links";

export default function Reading({ text, path, exists, onOpen }: { text: string; path: string; exists: (path: string) => boolean; onOpen: (path: string) => void }) {
  const t = useT();
  const tree = useMemo(() => renderMarkdown(rewriteRelLinks(text, path, exists), { allowImage: () => true }), [text, path, exists]);
  const lr: LinkRender = (href, kids, key): ReactNode | undefined => {
    if (href === MISSING_LINK) return <span key={key} title={t("not found")}>{kids}</span>;
    if (href.startsWith(OPEN_LINK)) {
      const to = decodeURIComponent(href.slice(OPEN_LINK.length));
      return <a key={key} href="#" onClick={(e) => { e.preventDefault(); onOpen(to); }}>{kids}</a>;
    }
    return undefined;
  };
  return (
    <div data-testid="md-reading" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
      <style>{MD_CSS}</style>
      <div className="md-body" style={{ maxWidth: 820, margin: "0 auto", padding: "16px 24px" }}>{view(tree, dirOf(path), lr)}</div>
    </div>
  );
}
