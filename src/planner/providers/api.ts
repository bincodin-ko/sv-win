// 13묶음 R2 S-3350·S-3351·S-3355: API 공급자 한 번 묻기(대화 상태 없음)
import type { Intent } from "../../commandbar/intent";
import { plannerApiAsk, plannerApiCancel, type ApiErr } from "../../lib/ipc";
import type { PlanFail } from "../fail";
import { PRIMER } from "../prompt";
import { extractJson, validatePlan, type Handles } from "../schema";
import type { ApiId } from ".";

export type ApiFail = PlanFail | { reason: "cancelled" };
export type ApiResult = { plan: { ok: Intent; why?: string } } | { fail: ApiFail };
export type ApiAskArgs = { id: string; provider: ApiId; model: string; baseUrl: string; req: string; handles: Handles; timeoutMs?: number };
export type ApiDeps = { ask: typeof plannerApiAsk; cancel: typeof plannerApiCancel };

let cur: string | null = null; // 지금 기다리는 요청 id (줄서기라 하나)
const bad = (detail: string): ApiResult => ({ fail: { reason: "bad", detail } });

function errFail(e: ApiErr, provider: ApiId, model: string): ApiFail {
  switch (e.kind) {
    case "cancelled": return { reason: "cancelled" };
    case "no key": case "no model": return { reason: e.kind, provider };
    case "url": case "auth": case "quota": case "timeout": return { reason: e.kind };
    case "net": return { reason: "net", detail: e.detail ?? "" };
    case "model": return { reason: "model", detail: model };
    case "http": return { reason: "http", detail: e.status ? (e.detail ? `${e.status}: ${e.detail}` : String(e.status)) : e.detail ?? "" };
    default: return { reason: "bad", detail: e.detail ?? "" };
  }
}

export async function apiAsk(a: ApiAskArgs, d: Partial<ApiDeps> = {}): Promise<ApiResult> {
  const { id, provider, model, baseUrl, req, handles, timeoutMs } = a;
  cur = id;
  let text: string;
  try {
    text = await (d.ask ?? plannerApiAsk)({ reqId: id, provider, model, baseUrl, system: PRIMER, user: req, timeoutMs });
  } catch (e) {
    return { fail: errFail((e && typeof e === "object" ? e : { kind: "bad", detail: String(e) }) as ApiErr, provider, model) };
  } finally {
    if (cur === id) cur = null;
  }
  const j = extractJson(text);
  if (!j || typeof j !== "object") return bad("no JSON");
  const o = j as { id?: unknown };
  if (o.id === undefined) o.id = id;
  else if (o.id !== id) return bad("wrong id");
  const v = validatePlan(j, { id, handles });
  if ("ok" in v) return { plan: v.why === undefined ? { ok: v.ok } : { ok: v.ok, why: v.why } };
  return "none" in v ? { fail: { reason: "none", detail: v.none } } : bad(v.bad);
}

/** S-3355: 기다리는 API 요청이 있으면 끊는다 */
export function cancelApi(d: Partial<ApiDeps> = {}): void {
  if (cur) void (d.cancel ?? plannerApiCancel)(cur).catch(() => false);
}
