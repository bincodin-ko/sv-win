// E3 S-2029: 에이전트 답에서 다이어그램 JSON 을 너그럽게 건진다. 순수 함수
export type DiagramShape = "box" | "ellipse" | "diamond" | "pill";
export interface DiagramNode {
  id: string;
  label: string;
  note?: string;
  shape: DiagramShape;
  group?: string;
}
export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
}
export interface Diagram {
  title: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

const MAX_NODES = 20;
const LABEL_MAX = 40;
const NOTE_MAX = 60;
const SHAPES = ["box", "ellipse", "diamond", "pill"];

/** `"key": [` 뒤에서 이미 닫힌 {…} 객체만 차례로 건진다(문자열 안의 괄호·따옴표는 무시). 잘린 마지막 객체는 버린다 */
function closedObjects(text: string, key: string): unknown[] {
  const m = new RegExp(`"${key}"\\s*:\\s*\\[`).exec(text);
  if (!m) return [];
  const out: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  for (let i = m.index + m[0].length; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") {
      if (depth++ === 0) start = i;
    } else if (c === "}") {
      if (depth > 0 && --depth === 0) {
        try {
          out.push(JSON.parse(text.slice(start, i + 1)));
        } catch {
          /* 깨진 객체는 버린다 */
        }
      }
    } else if (c === "]" && depth === 0) break;
  }
  return out;
}

const str = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string" && typeof v !== "number") return undefined;
  const s = String(v).trim().slice(0, max);
  return s || undefined;
};

export function parseDiagram(text: string): Diagram | null {
  const nodes: DiagramNode[] = [];
  const first = new Map<string, string>(); // 원래 id → 첫 노드의 (유일한) id
  const used = new Set<string>();
  for (const raw of closedObjects(text, "nodes")) {
    if (nodes.length >= MAX_NODES) break;
    const n = raw as Record<string, unknown>;
    const orig = str(n.id, 80);
    if (!orig) continue;
    let id = orig;
    for (let k = 2; used.has(id); k++) id = `${orig}-${k}`;
    used.add(id);
    if (!first.has(orig)) first.set(orig, id);
    nodes.push({
      id,
      label: str(n.label, LABEL_MAX) ?? id.slice(0, LABEL_MAX),
      ...(str(n.note, NOTE_MAX) ? { note: str(n.note, NOTE_MAX) } : {}),
      shape: SHAPES.includes(n.shape as string) ? (n.shape as DiagramShape) : "box",
      ...(str(n.group, LABEL_MAX) ? { group: str(n.group, LABEL_MAX) } : {}),
    });
  }
  if (!nodes.length) return null;
  const edges: DiagramEdge[] = [];
  for (const raw of closedObjects(text, "edges")) {
    const e = raw as Record<string, unknown>;
    const from = first.get(String(e.from));
    const to = first.get(String(e.to));
    if (!from || !to) continue;
    const label = str(e.label, LABEL_MAX);
    edges.push({ from, to, ...(label ? { label } : {}) });
  }
  const t = /"title"\s*:\s*("(?:[^"\\]|\\.)*")/.exec(text);
  let title = "Diagram";
  try {
    if (t) title = str(JSON.parse(t[1]!), LABEL_MAX) ?? title;
  } catch {
    /* 기본 제목 */
  }
  return { title, nodes, edges };
}
