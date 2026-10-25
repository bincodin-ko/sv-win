// S-2915·S-2930~S-2939: 답 JSON을 믿지 않고 표(INTENT_TABLE)대로 새 Intent를 조립한다.
import type { Intent, Target } from "../commandbar/intent";
import { ROLES } from "../commandbar/roles";
import { parseOpen } from "../commandbar/webCmd";
import { MAX_NAME } from "../console/names";
import { INTENT_TABLE, type Field } from "./table";

export type Handles = {
  consoles: Map<string, string>;
  groups: Map<string, string>;
  workspaces: Map<string, string>;
  agents: Set<string>;
};
export type PlanReq = { id: string; handles: Handles };
export type PlanResult = { ok: Intent; why?: string } | { none: string } | { bad: string };

/** 답 글에서 첫 번째로 균형이 맞는 {…}를 파싱. 없거나 깨졌으면 null */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i]!;
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

class Bad extends Error {}
const bad = (m: string): never => { throw new Bad(m); };
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const own = (o: Record<string, unknown>, k: string): unknown => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
const OUT: Record<string, string> = { agent: "agentId", group: "groupId" };

function target(s: unknown, h: Handles): Target {
  if (typeof s !== "string") return bad("target must be a handle string");
  if (s === "all") return { kind: "all" };
  if (s.startsWith("cli:")) {
    const id = s.slice(4);
    return h.agents.has(id) ? { kind: "cli", agentId: id } : bad(`no such agent ${id}`);
  }
  if (/^c\d+$/.test(s)) { const id = h.consoles.get(s); return id ? { kind: "console", id } : bad(`no such console ${s}`); }
  if (/^g\d+$/.test(s)) { const id = h.groups.get(s); return id ? { kind: "group", id } : bad(`no such group ${s}`); }
  return bad(`bad target ${s.slice(0, 20)} (use a handle like c1)`);
}

const str = (v: unknown, name: string, max: number): string => {
  if (typeof v !== "string") return bad(`${name} must be text`);
  return v.trim().length > max ? bad(`${name} is too long`) : v.trim();
};

/** 필드 하나. undefined를 돌려주면 "넣지 않음" */
function field(d: Field, name: string, raw: unknown, h: Handles): unknown {
  const absent = raw === undefined || raw === null;
  if (d.k === "count") {
    if (absent) return 1;
    if (typeof raw !== "number" || !Number.isFinite(raw)) return bad("n must be a number");
    return Math.min(12, Math.max(1, Math.floor(raw)));
  }
  if (absent) return d.req ? bad(`${name} is required`) : undefined;
  switch (d.k) {
    case "minutes":
      return typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= 1440 ? raw : bad("minutes must be 1-1440");
    case "text": { const s = str(raw, name, 2000); return s ? s : d.req ? bad(`${name} is empty`) : undefined; }
    case "label": { // 콘솔 이름: 23자 이하, 제어문자·< > 없음
      if (typeof raw !== "string") return bad(`${name} must be text`);
      const s = raw.trim();
      if (s.length > MAX_NAME || /[\p{Cc}<>]/u.test(s)) return bad(`${name} is not a valid console name`);
      return s || undefined;
    }
    case "name": case "message": {
      if (typeof raw !== "string") return bad(`${name} must be text`);
      const s = raw.trim().slice(0, d.k === "name" ? 80 : 200);
      return s ? s : d.req ? bad(`${name} is empty`) : undefined;
    }
    case "agent": return typeof raw === "string" && h.agents.has(raw) ? raw : bad("no such agent");
    case "role": return typeof raw === "string" && (ROLES as readonly string[]).includes(raw) ? raw : undefined;
    case "target": return target(raw, h);
    case "targets":
      return Array.isArray(raw) && raw.length >= 1 && raw.length <= 8 ? raw.map((x) => target(x, h)) : bad("targets must be 1-8 handles");
    case "group": { const id = typeof raw === "string" ? h.groups.get(raw) : undefined; return id ?? bad(`no such group ${String(raw).slice(0, 20)}`); }
    case "ws": { const id = typeof raw === "string" ? h.workspaces.get(raw) : undefined; return id ?? bad(`no such workspace ${String(raw).slice(0, 20)}`); }
    case "url": {
      const r = typeof raw === "string" ? parseOpen(raw) : null;
      return r && "url" in r ? r.url : bad("only http and https pages");
    }
    case "enum": return typeof raw === "string" && d.values.includes(raw) ? raw : bad(`${name} must be one of ${d.values.join("/")}`);
  }
}

function build(i: unknown, h: Handles): Intent {
  if (!isObj(i)) return bad("intent must be an object");
  const t = own(i, "t");
  if (typeof t !== "string" || !Object.prototype.hasOwnProperty.call(INTENT_TABLE, t)) return bad("unknown action");
  const out: Record<string, unknown> = { t };
  for (const [name, d] of Object.entries(INTENT_TABLE[t]!.fields)) {
    const v = field(d, name, own(i, name), h);
    if (v !== undefined) out[OUT[name] ?? name] = v;
  }
  if (t === "tell" && (out.targets as Target[]).some((x) => x.kind === "all")) return { t: "broadcast", text: out.text as string };
  if (t === "camera" && ["goto", "focusGroup", "cliLanes"].includes(out.op as string) && !out.target) bad("camera needs a target");
  if (t === "workspace") {
    if ((out.op === "go" || out.op === "close") && !out.ref) bad("workspace needs ref");
    if (out.op === "rename" && !out.name) bad("rename needs name");
  }
  return out as Intent;
}

export function validatePlan(reply: unknown, req: PlanReq): PlanResult {
  if (!isObj(reply)) return { bad: "reply is not an object" };
  if (own(reply, "id") !== req.id) return { bad: "reply id does not match" };
  const none = own(reply, "none");
  if (typeof none === "string") return { none: none.slice(0, 80) };
  if (own(reply, "intent") === undefined) return { bad: "no intent" };
  let ok: Intent;
  try { ok = build(own(reply, "intent"), req.handles); } catch (e) {
    if (e instanceof Bad) return { bad: e.message };
    throw e;
  }
  const w = own(reply, "why");
  const why = typeof w === "string" ? w.replace(/[<\r\n]/g, "").slice(0, 100) : "";
  return why ? { ok, why } : { ok };
}
