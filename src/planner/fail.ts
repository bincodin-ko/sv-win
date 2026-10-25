// S-2983: 실패 문구. off는 planner를 안 부른 것이므로 null(기존 needsPlanner 문구를 쓴다).
import { t } from "../i18n";
import type { ApiErr } from "../lib/ipc";
import { PROVIDERS, type ProviderId } from "./providers";

export type PlanFail =
  | { reason: "off" | "no agent" | "timeout" | "start" | "blocked" | "long" }
  | { reason: "login"; cli?: string }
  | { reason: "no key" | "no model"; provider: ProviderId }
  | { reason: "url" | "auth" | "quota" }
  | { reason: "bad" | "none" | "net" | "model" | "http"; detail: string };

const label = (id: ProviderId) => PROVIDERS.find((p) => p.id === id)?.label ?? id;

function why(f: PlanFail): string | null {
  switch (f.reason) {
    case "off": return null;
    case "no agent": return t("no planner is available — install a CLI agent or add an API key (Settings > Planner)");
    case "timeout": return t("the planner took longer than 20 seconds");
    case "start": return t("the planner couldn't start");
    case "login": return t("the planner needs you to sign in (run {cli} once in a console)", { cli: f.cli ?? "claude" });
    case "blocked": return t("the planner is waiting for an answer in its own window");
    case "bad": return t("the planner's answer wasn't usable ({detail})", { detail: f.detail });
    case "none": return t("the planner said: {none}", { none: f.detail });
    case "long": return t("that sentence is too long for the planner (500 characters)");
    case "no key": return t("the {provider} API key isn't set (Settings > Planner)", { provider: label(f.provider).replace(/ API$/, "") });
    case "no model": return t("pick a model for {provider} in Settings > Planner", { provider: label(f.provider) });
    case "url": return t("the server address isn't allowed (http only for this PC or your local network)");
    case "net": return t("couldn't reach {host}", { host: f.detail });
    case "auth": return t("the API key was rejected");
    case "quota": return t("the API is rate-limited or out of credit");
    case "model": return t("the model \"{model}\" wasn't found", { model: f.detail });
    case "http": return t("the API answered {detail}", { detail: f.detail });
  }
}

/** S-3354: ApiErr 를 틀 없는 이유 글로 (model 은 'model' 종류 문구에 쓸 모델 이름) */
export function apiReasonText(err: ApiErr, provider: ProviderId, model = ""): string {
  const d = err.detail ?? "";
  const f: PlanFail =
    err.kind === "no key" || err.kind === "no model" ? { reason: err.kind, provider }
    : err.kind === "url" || err.kind === "auth" || err.kind === "quota" ? { reason: err.kind }
    : err.kind === "timeout" ? { reason: "timeout" }
    : err.kind === "net" ? { reason: "net", detail: d }
    : err.kind === "model" ? { reason: "model", detail: model }
    : err.kind === "http" ? { reason: "http", detail: err.status ? (d ? `${err.status}: ${d}` : String(err.status)) : d }
    : { reason: "bad", detail: d };
  return why(f) ?? "";
}

export function failText(f: PlanFail): string | null {
  const reason = why(f);
  return reason === null ? null : t("I couldn't read that: {reason}. Start with who it is for, like @Otto run the tests", { reason });
}
