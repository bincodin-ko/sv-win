// S-1840·S-1843·S-1844: PDF 문서 CSS. 색은 항상 라이트 고정(앱 테마 변수를 쓰지 않는다) — 색이 든 줄마다 theme-fixed.
export type Paper = "letter" | "a4";

/** CSS 문자열 리터럴 안에 넣을 수 있게 */
export const cssStr = (s: string) => s.replace(/[\\"]/g, "\\$&").replace(/\r?\n/g, " ").replace(/</g, "\\3c ");

export function pdfCss(paper: Paper, title: string): string {
  const size = paper === "a4" ? "A4" : "8.5in 11in";
  return [
    `@page { size: ${size}; margin: 0.9in 1in;`,
    `  @top-center { content: "${cssStr(title)}"; font: 9pt "Segoe UI", sans-serif; color: #888888; } /* theme-fixed */`,
    `  @bottom-center { content: counter(page); font: 10pt "Segoe UI", sans-serif; color: #555555; } } /* theme-fixed */`,
    `@page :first { @top-center { content: none; } @bottom-center { content: none; } }`,
    `html { color-scheme: light; }`,
    `body { margin: 0; background: #ffffff; color: #1f2328; font: 11pt/1.55 "Segoe UI", system-ui, sans-serif; } /* theme-fixed */`,
    `.cover { break-after: page; padding-top: 3.2in; }`,
    `.cover .t { font-size: 30pt; font-weight: 700; line-height: 1.15; margin: 0 0 0.3in; }`,
    `.cover p { margin: 0.05in 0; color: #57606a; font-size: 12pt; } /* theme-fixed */`,
    `.cover .draft { color: #b35900; font-weight: 600; } /* theme-fixed */`,
    `.toc { break-after: page; } .toc .t { font-size: 16pt; font-weight: 700; margin-bottom: 0.15in; }`,
    `.toc ol { list-style: none; padding: 0; } .toc li { margin: 0.06in 0; } .toc .l2 { margin-left: 0.25in; } .toc .l3 { margin-left: 0.5in; }`,
    `a { color: #0969da; text-decoration: none; } /* theme-fixed */`,
    `h1, h2, h3, h4 { break-after: avoid; line-height: 1.25; } h1 { font-size: 21pt; } h2 { font-size: 16pt; } h3 { font-size: 13pt; }`,
    `pre { background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 4px; padding: 0.1in 0.14in; font: 9.5pt/1.45 Consolas, "Courier New", monospace; white-space: pre-wrap; break-inside: avoid; } /* theme-fixed */`,
    `code { background: #f0f2f4; border-radius: 3px; padding: 0 3px; font: 0.92em Consolas, "Courier New", monospace; } pre code { background: none; padding: 0; } /* theme-fixed */`,
    `.tk-keyword { color: #cf222e; } .tk-string { color: #0a3069; } .tk-comment { color: #6e7781; font-style: italic; } .tk-number { color: #0550ae; } /* theme-fixed */`,
    `table { border-collapse: collapse; margin: 0.1in 0; } th, td { border: 1px solid #d0d7de; padding: 4px 8px; } th { background: #f6f8fa; } /* theme-fixed */`,
    `blockquote { margin: 0.1in 0; padding: 0 0.16in; border-left: 3px solid #d0d7de; color: #57606a; } /* theme-fixed */`,
    `blockquote.callout { border-left-color: #0969da; background: #ddf4ff; color: #1f2328; padding: 0.08in 0.16in; break-inside: avoid; } /* theme-fixed */`,
    `.callout .label { font-weight: 700; font-size: 9pt; letter-spacing: 0.05em; color: #0969da; } /* theme-fixed */`,
    `hr { border: 0; border-top: 1px solid #d0d7de; margin: 0.2in 0; } /* theme-fixed */`,
    `img { max-width: 100%; } .ph { display: block; border: 1px dashed #8c959f; color: #57606a; padding: 0.3in; text-align: center; margin: 0.1in 0; } /* theme-fixed */`,
    `li.task { list-style: none; margin-left: -1.2em; }`,
  ].join("\n");
}
