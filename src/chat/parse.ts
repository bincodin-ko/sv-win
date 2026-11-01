// 대기열 1번: CLI 대화 기록(JSONL) → 채팅 화면 메시지. Claude(~/.claude/projects/…/<id>.jsonl)·Codex(sessions/…/rollout-*-<id>.jsonl)
export type Tool = { name: string; detail: string };
export type Msg = { role: "user" | "assistant"; text: string } | { role: "tools"; tools: Tool[] };

/** 도구 입력 중 사람이 알아볼 한 줄(명령·파일·패턴·설명) */
function summary(input: unknown): string {
  if (typeof input === "string") {
    try { return summary(JSON.parse(input)); } catch { return input.slice(0, 160); }
  }
  if (!input || typeof input !== "object") return "";
  const o = input as Record<string, unknown>;
  const v = o.command ?? o.cmd ?? o.file_path ?? o.path ?? o.pattern ?? o.url ?? o.query ?? o.description ?? o.prompt;
  const s = Array.isArray(v) ? v.join(" ") : typeof v === "string" ? v : JSON.stringify(o);
  return s.replace(/\s+/g, " ").slice(0, 160);
}

// 사람이 쓴 말이 아닌 사용자 줄(명령 메타·환경 안내·하위 출력)
const META = /^\s*<(command-|local-command|environment_context|user_instructions|system-reminder|bash-|task-notification)/;

/** 한 줄 → 메시지 조각들(도구는 { role:"tools" } 하나씩) */
export function lineToMsgs(agent: string, line: string): Msg[] {
  let v: Record<string, any>;
  try { v = JSON.parse(line); } catch { return []; }
  const out: Msg[] = [];
  const say = (role: "user" | "assistant", t: unknown) => { if (typeof t === "string" && t.trim() && !(role === "user" && META.test(t))) out.push({ role, text: t.trim() }); };
  const tool = (name: unknown, input: unknown) => out.push({ role: "tools", tools: [{ name: String(name ?? "tool"), detail: summary(input) }] });
  if (agent === "claude") {
    if (v.isSidechain || v.isMeta) return [];
    const c = v.message?.content;
    if (v.type === "user") {
      if (typeof c === "string") say("user", c);
      else if (Array.isArray(c)) for (const b of c) if (b?.type === "text") say("user", b.text); // tool_result 는 보이지 않는다
    } else if (v.type === "assistant" && Array.isArray(c)) {
      for (const b of c) {
        if (b?.type === "text") say("assistant", b.text);
        else if (b?.type === "tool_use") tool(b.name, b.input);
      }
    }
  } else if (agent === "codex" && v.type === "response_item") {
    const p = v.payload ?? {};
    if (p.type === "message" && Array.isArray(p.content)) {
      const role = p.role === "user" ? "user" : p.role === "assistant" ? "assistant" : null;
      if (role) for (const b of p.content) if (b?.type === "input_text" || b?.type === "output_text") say(role, b.text);
    } else if (p.type === "function_call" || p.type === "custom_tool_call") tool(p.name, p.arguments ?? p.input);
    else if (p.type === "local_shell_call") tool("shell", p.action);
  }
  return out;
}

/** 이어 붙이기: 연달은 도구는 한 묶음("실행된 도구 N개")으로 합친다. 원래 배열은 안 바꾼다 */
export function appendMsgs(list: Msg[], add: Msg[]): Msg[] {
  const out = list.slice();
  for (const m of add) {
    const last = out[out.length - 1];
    if (m.role === "tools" && last?.role === "tools") out[out.length - 1] = { role: "tools", tools: [...last.tools, ...m.tools] };
    else out.push(m);
  }
  return out;
}

/** 권한·선택 질문의 보기들. 번호 목록이면 keys = 그 숫자, 번호 없는 목록(❯ 표시가 움직이는 것)이면 화살표로 옮긴 뒤 Enter.
 * 설치본 실측: 폴더 신뢰 질문이 "❯ No, exit / Yes, I trust this folder" 처럼 번호가 없어 단추가 안 떴다 */
export function promptOptions(lines: string[]): { label: string; keys: string }[] {
  const num = lines.map((l) => l.match(/^\s*[❯›>]?\s*(\d)\.\s+(.+?)\s*$/)).filter((m): m is RegExpMatchArray => !!m);
  if (num.length) return num.map((m) => ({ label: `${m[1]}. ${m[2]}`, keys: m[1]! }));
  const h = lines.findIndex((l) => /^\s*[❯›]\s+\S/.test(l));
  if (h < 0) return [];
  const indent = lines[h]!.search(/[❯›]/);
  const isItem = (l: string | undefined) => !!l && l.trim() !== "" && !/esc to|enter to|to confirm|to cancel/i.test(l) && (/^\s*[❯›]\s+\S/.test(l) || l.search(/\S/) >= indent + 1);
  let a = h, b = h;
  while (isItem(lines[a - 1])) a--;
  while (isItem(lines[b + 1])) b++;
  return lines.slice(a, b + 1).map((l, i) => {
    const d = i - (h - a);
    return { label: l.replace(/^\s*[❯›]?\s*/, "").trim(), keys: (d < 0 ? "\x1b[A".repeat(-d) : "\x1b[B".repeat(d)) + "\r" };
  });
}

// 채팅 입력창 / 자동완성: CLI 내장 명령(추측 목록 — CLI 판이 바뀌면 여기만 고침) + 스킬·사용자 명령
export const BUILTIN: Record<string, string[]> = {
  claude: ["/clear", "/compact", "/resume", "/model", "/context", "/cost", "/usage", "/memory", "/init", "/review", "/agents", "/mcp", "/permissions", "/hooks", "/plugin", "/config", "/status", "/export", "/rewind", "/help"],
  codex: ["/new", "/compact", "/model", "/approvals", "/diff", "/status", "/mention", "/init", "/quit"],
};
/** "/" 로 시작하고 빈칸 전이면 앞이 같은 명령(최대 8개). 아니면 빈 목록 */
export function slashSuggest(text: string, names: string[]): string[] {
  if (!/^\/\S*$/.test(text)) return [];
  const q = text.toLowerCase();
  return [...new Set(names)].filter((n) => n.toLowerCase().startsWith(q) && n.toLowerCase() !== q).slice(0, 8);
}
