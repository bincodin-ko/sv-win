// E3 S-2027: 다이어그램 프롬프트(영어). 순수 함수. 문구·스키마는 추측(원본 형식 미공개), 수·규칙은 문서
import type { Effort } from "../studio/run";

export type DiagramStyle = "ink" | "colorful";
/** FROM YOUR PROJECT 버튼 6개 (S-2021). id 는 buildDiagramPrompt 의 subject 로 넘긴다 */
export const DIAGRAM_TOPICS: { id: string; label: string; ask: string }[] = [
  { id: "architecture", label: "Architecture", ask: "the overall architecture of this project: its main layers and modules and how they connect" },
  { id: "user-flow", label: "User flow", ask: "the main user flow through this project, step by step from the user's point of view" },
  { id: "data-flow", label: "Data flow", ask: "how data moves through this project: where it comes from, how it is transformed, stored and shown" },
  { id: "components", label: "Components", ask: "the main components of this project and which ones depend on which" },
  { id: "request-lifecycle", label: "Request lifecycle", ask: "the lifecycle of one typical request through this project, from the trigger to the final result" },
  { id: "state-flow", label: "State flow", ask: "the important states of this project and the transitions between them" },
];
const COUNT: Record<Effort, string> = { quick: "6-10", balanced: "8-14", thorough: "10-16" };

export function buildDiagramPrompt(subject: string, effort: Effort, style: DiagramStyle): string {
  const topic = DIAGRAM_TOPICS.find((t) => t.id === subject)?.ask ?? subject.trim();
  return [
    `Draw a diagram of ${topic}.`,
    "Do not run any tools or open any files. Use only what you can already see in this repo.",
    "Reply with one JSON object and nothing else.",
    'Schema: {"title": string, "nodes": [{"id": string, "label": string (at most 4 words), "note"?: string (at most 8 words), "shape": "box"|"ellipse"|"diamond"|"pill", "group"?: string}], "edges": [{"from": id, "to": id, "label"?: string (one short verb)}]}',
    `Use ${COUNT[effort]} components.`,
    "Label a few edges with a short verb. Label every edge leaving a decision with its answer. Steps use shape pill. Use groups only for real layers.",
    ...(style === "colorful" ? ["Colors follow groups, so set group on every node that belongs to a real layer."] : []),
  ].join("\n");
}
