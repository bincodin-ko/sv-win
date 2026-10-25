// E6 S-1974·S-1975: 문서 9종 + 자유 요청의 프롬프트(순수 함수). 한 줄로 type() 한 번에 보낸다(S-1978)
import type { Effort } from "../run";

export interface DocDef { id: string; name: string; blurb: string }
export const DOCS: DocDef[] = [
  { id: "overview", name: "Project overview", blurb: "What this repo is, at a glance" }, // 첫 항목 문구만 영상, 나머지 설명은 추측(S-1974)
  { id: "onboarding", name: "Onboarding guide", blurb: "How a new developer gets set up and productive" },
  { id: "architecture", name: "Architecture", blurb: "How the code is organised and why" },
  { id: "readme", name: "README", blurb: "A front page for the project" },
  { id: "api", name: "API reference", blurb: "Every public endpoint or function, documented" },
  { id: "data-model", name: "Data model", blurb: "The main data structures and how they relate" },
  { id: "security", name: "Security overview", blurb: "Trust boundaries, secrets and known risks" },
  { id: "testing", name: "Testing guide", blurb: "How to run the tests and write new ones" },
  { id: "release-notes", name: "Release notes", blurb: "What changed recently, in plain language" },
];
// 단어 수는 S-1979 (Quick 400–700 / Balanced 700–1,100 / Thorough 900–1,500)
export const EFFORT_WORDS: Record<Effort, string> = {
  quick: "400–700 words",
  balanced: "700–1,100 words",
  thorough: "900–1,500 words",
};
const RULES = "Do not run any tools or open any files. Write only from what you can already see in this repo and its project notes. Write in English. Output only the document in Markdown, starting with a single # title. No preamble, no code fence around it. Use at most one `> **Note** ...` blockquote for cautions. Do not use images.";

export function buildPrompt(req: { docId: string; ask?: string }, effort: Effort): string {
  const d = DOCS.find((x) => x.id === req.docId);
  const what = d ? `Write the "${d.name}" document for the project in the current folder (${d.blurb.toLowerCase()}).` : `Write this for the project in the current folder: ${(req.ask ?? "").replace(/\s+/g, " ").trim()}`;
  return `${what} Length: ${EFFORT_WORDS[effort]}. ${RULES}`;
}
