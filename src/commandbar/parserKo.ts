// K8 S-2490~S-2501: 한국어 문장 -> Intent. 못 맞추면 null (그러면 영어 규칙이 이어서 본다).
// 대상 해석은 영어 resolveTarget·kind·wsRef·loopOf 를 그대로 쓰고, 여기서는 한국어 어순·어미·조사만 푼다.
// parser.ts 와 서로 불러오지만 둘 다 부를 때 쓰는 함수뿐이라 괜찮다.
import type { Intent, ParseCtx, Target } from "./intent";
import { cliId, kind, loopOf, mentionRe, resolveTarget, wsRef } from "./parser";
import { ROLE_AGENT } from "./roles";
import { countOf, UNAVAILABLE } from "./words";
import { parseOpen } from "./webCmd";

type R = { ok: Target } | { err: Intent };

// ---- 어미: -해/-해줘/-해 주세요/-해라/-하자/-할래/-해봐/-하세요/-해요/-합니다 를 한 꼴로 ----
const HA = "(?:해|하자|할래|하세요|합니다|하라|해라|할게)";
const T = String.raw`(?:\s*(?:줘요|줘|주세요|주라|봐요|봐|요|라))*`;
/** 명사형 동사: "실행" "실행해" "실행해줘" */
const hv = (...w: string[]) => `(?:${w.join("|")})(?:${HA})?${T}`;
/** 활용형을 그대로 나열한 동사 */
const v = (...w: string[]) => `(?:${w.join("|")})${T}`;

const SPAWN = [v("띄워", "띄우자", "띄울래", "띄우세요", "띄웁니다", "띄우", "만들어", "만들자", "만들래", "만드세요", "만듭니다", "켜", "켜자"), hv("실행", "생성", "시작", "소환")].join("|");
const CREATE = [v("만들어", "만들자", "만들래", "만드세요", "만듭니다"), hv("생성", "구성")].join("|");
const ADD = [hv("추가", "생성"), v("만들어", "남겨", "넣어", "넣자", "더해", "붙여", "놔", "놓아")].join("|");
const PAUSE = [v("멈춰", "멈추자", "멈출래", "멈추세요", "멈춥니다"), hv("일시\\s*중지", "일시\\s*정지", "중지", "정지", "대기")].join("|");
const RESUME = `(?:다시\\s*)?(?:${[hv("재개", "진행", "계속"), v("이어가", "이어서\\s*해", "풀어")].join("|")})`;
const RESTART = `(?:다시\\s*시작|재시작|재부팅|리스타트)(?:${HA})?${T}`;
const CLOSE = [v("닫아", "닫자", "닫을래", "닫으세요", "닫습니다", "꺼", "끄자", "지워", "지우자", "지울래", "지우세요", "없애"), hv("종료", "삭제", "제거")].join("|");
const OPEN = [v("열어", "열자", "열래", "열게", "열기", "엽니다", "여세요"), hv("오픈")].join("|");
const GO = [v("가", "가자", "갈래", "갈게", "넘어가", "바꿔"), hv("이동", "전환")].join("|");
const FWD = v("넘겨", "넘기자", "넘길래", "넘깁니다", "전달해", "보내", "전해");
const HAND = [v("넘겨", "넘기자", "넘길래", "넘깁니다", "맡겨", "맡기자", "전달해", "인계해"), hv("핸드오프")].join("|");
const CONN = [hv("연결"), v("이어", "붙여")].join("|");
const RENAME = [v("바꿔", "바꾸자", "바꿀래"), hv("변경", "수정")].join("|");

// ---- 수 낱말 (S-2490): 한/하나/한 개/1개, 두/둘, 세/셋, 네/넷, 다섯 … 열둘 ----
const NUM: Record<string, number> = { 하나: 1, 한: 1, 둘: 2, 두: 2, 셋: 3, 세: 3, 넷: 4, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10, 열하나: 11, 열한: 11, 열둘: 12, 열두: 12 };
const NUMW = Object.keys(NUM).sort((a, b) => b.length - a.length).map((w) => (w.startsWith("열") && w.length > 1 ? `열\\s*${w.slice(1)}` : w)).join("|");
const UNIT = "(?:개|명|대|마리|곳)";
/** 단위가 붙으면 뒤에 조사가 와도 되고("세 개로"), 단위가 없으면 뒤가 한글이 아니어야 한다 */
const COUNT = new RegExp(`(?<![가-힣\\w])(?:(\\d+|${NUMW})\\s*${UNIT}|(\\d+|${NUMW})(?![가-힣\\d]))`);
const numOf = (w: string): number | null => (/^\d+$/.test(w) ? countOf(w) : countOf(String(NUM[w.replace(/\s+/g, "")] ?? "")));

// ---- 조사 ----
const PART = "(?:에게는|한테는|에게서|께서는|에게|한테|께서|께|으로|로|에는|에서|에|은|는|이|가|을|를|도|의)";
const PART_END = new RegExp(`${PART}$`);
const PART_ONLY = new RegExp(`^${PART}?$`);

const lo = (x: string) => x.toLowerCase();
const nameList = (ctx: ParseCtx) => [...ctx.consoles, ...ctx.groups].map((x) => x.name.trim()).filter(Boolean).sort((a, b) => b.length - a.length);

/** "Otto한테" "리뷰어 그룹에" "그룹 1을" "클로드 레인" -> 영어 resolveTarget (S-2492·S-2501) */
function target(raw: string, ctx: ParseCtx): R {
  const p = raw.trim();
  for (const n of nameList(ctx)) if (lo(p).startsWith(lo(n)) && PART_ONLY.test(p.slice(n.length))) return resolveTarget(n, ctx); // 이름이 조사처럼 끝나도 먼저 대조
  const q = p.replace(PART_END, "").trim() || p;
  if (/^(?:전부|전체|모두|전원|다들|다|모든\s*(?:콘솔|에이전트)?)$/.test(q)) return resolveTarget("everyone", ctx);
  const gn = q.match(/^그룹\s*(\d+)\s*(?:번)?$/);
  if (gn) return resolveTarget(`group ${gn[1]}`, ctx);
  const gw = q.match(/^(.+?)\s*그룹$/) ?? q.match(/^그룹\s+(.+)$/);
  if (gw) return resolveTarget(`group ${gw[1]}`, ctx);
  const cw = q.match(/^(.+?)\s*(?:레인|콘솔|에이전트)$/);
  if (cw) return resolveTarget(`${cw[1]} console`, ctx);
  return resolveTarget(q, ctx);
}
/** "Mia와 Otto" 처럼 여럿이면 쪼개서 */
function targets(raw: string, ctx: ParseCtx): { ok: Target[] } | { err: Intent } {
  const whole = target(raw, ctx);
  if ("ok" in whole) return { ok: [whole.ok] };
  const parts = raw.split(/(?<=[가-힣\w])(?:와|과|랑|이랑|하고)\s+|\s*,\s*|\s+및\s+/).map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2) return { err: whole.err };
  const ok: Target[] = [];
  for (const x of parts) {
    const r = target(x, ctx);
    if ("err" in r) return r;
    ok.push(r.ok);
  }
  return { ok };
}
const wrap = (r: R, f: (t: Target) => Intent): Intent => ("ok" in r ? f(r.ok) : r.err);
const opt = <O extends Intent>(o: O): O => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined)) as O;

// ---- 지시 글: "…라고 해/시켜/말해" 는 어미를 떼고 "라고" 앞까지가 지시 글 (S-2492) ----
const SAYS = /^(.*?)\s*(?:이?라고|하라고)\s*(?:해|해줘|해 줘|해요|해주세요|해 주세요|시켜|시켜줘|시켜 줘|시켜요|말해|말해줘|말해 줘|말해요|전해|전해줘|전해 줘|전달해|전달해줘)$/;
const MAKE = /^(.*?)\s*(?:시켜|시켜줘|시켜 줘|시켜요)$/;
const textOf = (x: string): string => {
  const a = x.match(SAYS) ?? x.match(MAKE);
  return (a ? a[1]! : x).trim();
};

type Pick = { phrase: string; text: string; strong: boolean };
/** 앞쪽 낱말 1~4개를 "대상 + 조사"로 보고 나머지를 지시 글로 */
function split(s: string): Pick[] {
  const w = s.split(" ");
  const out: Pick[] = [];
  for (let k = 1; k < Math.min(5, w.length); k++) {
    const last = w[k - 1]!;
    const m = last.match(/(?:에게는|한테는|에게서|께서는|에게|한테|께서|께|에는|에다가|에다|에|는|은|도|이|가)$/);
    if (m) out.push({ phrase: w.slice(0, k).join(" "), text: w.slice(k).join(" "), strong: /^(?:에게|한테|께)/.test(m[0]) });
  }
  return out;
}

const SAME = /^같은\s*(?:지시|명령|프롬프트|메시지|작업|말)\s*[:：,\-]?\s*(.+)$/;
const ALL_KO = /^(?:전부|전체|모두|전원|다들)$/;

function tellKo(s: string, ctx: ParseCtx): Intent | null {
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^보드(?:에게|한테|에)\s+(.+)$/))) return { t: "orderUnrouted", text: textOf(m[1]!) };
  for (const c of split(s)) {
    const r = targets(c.phrase, ctx);
    if ("ok" in r) {
      const same = c.text.match(SAME);
      if (same && r.ok.length === 1 && r.ok[0]!.kind === "all") return { t: "broadcast", text: same[1]! };
      return { t: "tell", targets: r.ok, text: textOf(c.text) };
    }
    if (r.err.t === "ambiguous") return r.err;
    if (c.strong) return r.err; // "Bob한테 …" = 그런 이름이 없다
  }
  if ((m = s.match(/^(전부|전체|모두|전원|다들)\s+(.+)$/)) && ALL_KO.test(m[1]!)) {
    const same = m[2]!.match(SAME);
    return same ? { t: "broadcast", text: same[1]! } : { t: "tell", targets: [{ kind: "all" }], text: textOf(m[2]!) };
  }
  return null;
}

// ---- 시작 · 그룹 (S-2490·S-2491) ----
const toEn = (x: string) => x.replace(/에이전트/g, "agent").replace(/콘솔/g, "console").replace(/셸|쉘/g, "shell").replace(/터미널/g, "terminal");
/** "클로드 세 개로" -> {n, rest(영어 kind 가 읽을 글)} */
function countRest(o: string, dflt: number): { n: number; rest: string } {
  let n = dflt;
  const m = o.match(COUNT);
  if (m) {
    n = numOf((m[1] ?? m[2])!) ?? dflt;
    o = o.replace(m[0], " ");
  }
  const rest = toEn(o.replace(/\s+/g, " ").trim().replace(/\s*(?:으로|로|을|를)$/, "").trim());
  return { n, rest };
}
const agentOf = (k: { agentId?: string; role?: string }) => k.agentId ?? (k.role ? ROLE_AGENT[k.role as keyof typeof ROLE_AGENT] ?? undefined : undefined);

function startKo(s: string, ctx: ParseCtx): Intent | null {
  let m: RegExpMatchArray | null;
  if ((m = s.match(new RegExp(`^(.*?)\\s*그룹\\s*(?:(?:을|를)\\s*)?(?:(?:하나|한\\s*개)\\s*)?(?:을|를)?\\s*(?:${CREATE})$`)))) {
    const { n, rest } = countRest(m[1]!, 3);
    const k = kind(rest, ctx);
    return k ? opt({ t: "makeGroup", n, agentId: agentOf(k) }) : null;
  }
  if ((m = s.match(new RegExp(`^(.+?)(?:에다가|에다|에)\\s+(.+?)\\s*(?:을|를)?\\s*(?:${ADD})$`)))) {
    const { n, rest } = countRest(m[2]!, 1);
    const k = kind(rest, ctx);
    if (!k) return null;
    const r = target(m[1]!, ctx);
    if ("err" in r) return r.err;
    return r.ok.kind === "group" ? opt({ t: "addToGroup", n, groupId: r.ok.id, agentId: k.agentId }) : { t: "notFound", name: m[1]! };
  }
  if ((m = s.match(new RegExp(`^(.+?)\\s*(?:을|를)?\\s*(?:${SPAWN})$`)))) {
    const { n, rest } = countRest(m[1]!, 1);
    const k = kind(rest, ctx);
    return k ? opt({ t: "spawn", n, agentId: agentOf(k), role: k.role }) : null;
  }
  return null;
}

// ---- 제어 · 카메라 (S-2494·S-2496) ----
const ctl = (obj: string, ctx: ParseCtx, f: (t: Target) => Intent): Intent | null => {
  const r = target(obj, ctx);
  if ("err" in r && r.err.t === "notFound" && /(?:에게|한테|께)(?:\s|$)/.test(obj)) return null; // "Otto한테 테스트 중지해" 는 시키기
  return wrap(r, f);
};
function controlKo(s: string, ctx: ParseCtx): Intent | null {
  let m: RegExpMatchArray | null;
  const ALL: Target = { kind: "all" };
  if ((m = s.match(new RegExp(`^(.*?)\\s*(?:${PAUSE})$`)))) return m[1] ? ctl(m[1], ctx, (target) => ({ t: "pause", target })) : { t: "pause", target: ALL };
  if ((m = s.match(new RegExp(`^(.*?)\\s*(?:${RESUME})$`)))) return m[1] ? ctl(m[1], ctx, (target) => ({ t: "resume", target })) : { t: "resume", target: ALL };
  if ((m = s.match(new RegExp(`^(.+?)\\s*(?:${RESTART})$`)))) return ctl(m[1]!, ctx, (target) => ({ t: "restart", target }));
  if ((m = s.match(new RegExp(`^(.+?)\\s*(?:${CLOSE})$`)))) return ctl(m[1]!, ctx, (target) => ({ t: "close", target }));
  if ((m = s.match(new RegExp(`^(.+?)\\s*(?:으로|로)\\s*(?:${GO})$`)))) return wrap(target(m[1]!, ctx), (t) => ({ t: "camera", op: "goto", target: t }));
  if ((m = s.match(/^(.+?)\s*(?:을|를)?\s*보여\s*(?:줘|주세요|줘요|줄래)?$/))) {
    const r = target(m[1]!, ctx);
    return wrap(r, (t) => (t.kind === "cli" ? { t: "camera", op: "cliLanes", target: t } : { t: "camera", op: "goto", target: t }));
  }
  return null;
}

// ---- 열기 (S-2496) ----
const PANEL: Record<string, Extract<Intent, { t: "open" }>["what"]> = {
  설정: "settings", 환경설정: "settings", 프리셋: "presets", 메모리: "memory", 루프: "loops", 미션맵: "mission", 사용량: "usage",
  문서: "documents", 코드: "code", 마크다운: "markdown", 스킬: "skills",
};
function openKo(s: string): Intent | null {
  const m = s.match(new RegExp(`^(.+?)\\s*(?:을|를)?\\s*(?:${OPEN})$`));
  if (!m) return null;
  const w = m[1]!.replace(/\s+/g, "");
  if (PANEL[w]) return { t: "open", what: PANEL[w]! };
  if (w === "깃허브" || UNAVAILABLE.includes(lo(w))) return { t: "unavailable", what: "github" };
  const web = parseOpen(m[1]!);
  if (!web) return null;
  return "url" in web ? { t: "openWeb", url: web.url } : { t: "openWeb", url: m[1]!, bad: true };
}

// ---- 워크스페이스 (S-2497) ----
function workspaceKo(s: string, ctx: ParseCtx): Intent | null {
  if (!s.includes("워크스페이스")) return null;
  let m: RegExpMatchArray | null;
  const NEW = [hv("생성", "추가"), v("만들어", "만들자", "만들래", "열어")].join("|");
  const go = (x: string): Intent => {
    const r = wsRef(x, ctx);
    return "ok" in r ? { t: "workspace", op: "go", ref: r.ok } : r.err;
  };
  const here = /^(?:이|현재|지금)$/;
  if ((m = s.match(new RegExp(`^이\\s*워크스페이스\\s*(?:의\\s*)?(?:이름)?(?:을|를)?\\s*(.+?)\\s*(?:으로|로)\\s*(?:${RENAME})$`)))) return { t: "workspace", op: "rename", name: m[1]! };
  if ((m = s.match(new RegExp(`^워크스페이스\\s*(.+?)\\s*(?:의\\s*)?이름을\\s*(.+?)\\s*(?:으로|로)\\s*(?:${RENAME})$`)))) {
    const r = wsRef(m[1]!, ctx);
    return "ok" in r ? { t: "workspace", op: "rename", ref: r.ok, name: m[2]! } : r.err;
  }
  if ((m = s.match(new RegExp(`^워크스페이스\\s*(\\S+?)\\s*(?:번)?\\s*(?:으로|로)\\s*(?:${GO})$`)))) return go(m[1]!);
  if ((m = s.match(new RegExp(`^(.+?)\\s*워크스페이스\\s*(?:으로|로)\\s*(?:${GO})$`)))) return go(m[1]!);
  const close = (x: string): Intent => {
    if (here.test(x)) return { t: "workspace", op: "close" };
    const r = wsRef(x, ctx);
    return "ok" in r ? { t: "workspace", op: "close", ref: r.ok } : r.err;
  };
  if ((m = s.match(new RegExp(`^워크스페이스\\s*(\\S+?)\\s*(?:번)?\\s*(?:을|를)?\\s*(?:${CLOSE})$`)))) return close(m[1]!);
  if ((m = s.match(new RegExp(`^(.+?)\\s*워크스페이스\\s*(?:을|를)?\\s*(?:${CLOSE})$`)))) return close(m[1]!);
  if (new RegExp(`^새\\s*워크스페이스\\s*(?:를|을)?\\s*(?:${NEW})$`).test(s)) return { t: "workspace", op: "new" };
  if ((m = s.match(/^새\s*워크스페이스\s+(.+)$/))) return { t: "workspace", op: "new", name: m[1]! };
  if ((m = s.match(new RegExp(`^(.+?)\\s*(?:이?라는|이?라고\\s*(?:하는|부르는))\\s*(?:새\\s*)?워크스페이스\\s*(?:를|을)?\\s*(?:하나\\s*)?(?:${NEW})$`)))) return { t: "workspace", op: "new", name: m[1]! };
  if (new RegExp(`^워크스페이스\\s*(?:를|을)?\\s*(?:하나\\s*)?(?:${NEW})$`).test(s)) return { t: "workspace", op: "new" };
  if ((m = s.match(new RegExp(`^(.+?)\\s+워크스페이스\\s*(?:를|을)?\\s*(?:${NEW})$`)))) return { t: "workspace", op: "new", name: m[1]! };
  return null;
}

// ---- 노드 추가 (S-2498) ----
const ADDWHAT: [string, Extract<Intent, { t: "add" }>["what"]][] = [
  ["메모|스티커|노트", "note"], ["칸반", "kanban"], ["캘린더|달력", "calendar"], ["체크리스트|할\\s*일|투두", "checklist"], ["브라우저|웹", "browser"],
];
function addKo(s: string): Intent | null {
  for (const [kw, what] of ADDWHAT) {
    const m = s.match(new RegExp(`^(?:${kw})\\s*(?:(?:한|하나|1)\\s*(?:개)?\\s*)?(?:을|를)?\\s*(?:${ADD})\\s*(?:[:：]\\s*|\\s+)?(.*)$`));
    if (!m) continue;
    const rest = m[1]!.trim();
    if (what !== "note") return rest ? null : { t: "add", what };
    const text = rest.replace(/\s*(?:이?라고)\s*(?:적어|써|남겨|메모해|기록해)(?:줘|주세요|\s*줘|\s*주세요)?$/, "").trim();
    return text ? { t: "add", what, text } : { t: "add", what };
  }
  return null;
}

// ---- 주기 · 넘기기 · 오케스트레이터 (S-2499) ----
const UNIT_EN: Record<string, string> = { 초: "seconds", 분: "minutes", 시간: "hours", 하루: "days", 일: "days", 일주일: "weeks", 주: "weeks" };
function loopKo(s: string): Intent | null {
  const m = s.match(new RegExp(`^(?:매\\s*)?(?:(\\d+|${NUMW})\\s*)?(일주일|하루|시간|초|분|일|주)\\s*(?:마다|간격으로)(?:\\s*,?\\s*(.*))?$`));
  if (!m) return null;
  const n = m[1] ? String(/^\d+$/.test(m[1]) ? m[1] : NUM[m[1].replace(/\s+/g, "")]) : "";
  return loopOf([m[0], n, UNIT_EN[m[2]!]!, m[3] ?? ""]);
}
function handoffKo(s: string, ctx: ParseCtx): Intent | null {
  const mre = mentionRe(ctx);
  const bare = s.replace(mre, " ").replace(/\s+/g, " ").trim();
  const m = bare.match(new RegExp(`^(?:(?:이|그|지금)\\s*(?:작업|일|거|것|태스크)\\s*(?:을|를)?\\s*)?(\\S+?)(?:에게|한테|에|로|으로)\\s*(?:${HAND})$`));
  if (!m) return null;
  const agentId = cliId(m[1]!, ctx) ?? lo(m[1]!);
  const first = [...s.matchAll(mre)][0]?.[2];
  if (!first) return { t: "handoff", agentId };
  const r = resolveTarget(first, ctx);
  if ("err" in r) return r.err;
  return r.ok.kind === "console" ? { t: "handoff", agentId, from: r.ok.id } : { t: "notFound", name: first };
}
function forwardKo(s: string, ctx: ParseCtx): Intent | null {
  const m = s.match(new RegExp(`^(.+?)\\s*(?:이|가|은|는)?\\s*(?:끝나면|끝나거든|끝나는\\s*대로|끝난\\s*(?:뒤|후)에|끝난\\s*다음에|다\\s*되면|완료되면)\\s*,?\\s*(?:(?:결과물|결과|출력|전부|모두|다|그거|그대로)\\s*(?:를|을)?\\s*)*(.+?)\\s*(?:에게|한테|에|로|으로)\\s*(?:${FWD})$`));
  if (!m) return null;
  const they = /^(?:그들|걔네|걔들|다들)$/.test(m[1]!.replace(PART_END, "").trim());
  const src = they ? { ok: [] as Target[] } : targets(m[1]!, ctx);
  if ("err" in src) return src.err;
  const d = targets(m[2]!, ctx);
  if ("err" in d) return d.err;
  return opt({ t: "forward", sources: src.ok, they: they || undefined, dests: d.ok });
}
function orchKo(s: string, ctx: ParseCtx): Intent | null {
  if (!s.includes("오케스트레이터")) return null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(new RegExp(`^(.+?)\\s*(?:을|를)?\\s*오케스트레이터\\s*(\\S*?)\\s*(?:에게|에|와|랑)\\s*(?:${CONN})$`)))) {
    const r = target(m[1]!, ctx);
    if ("err" in r) return r.err;
    return r.ok.kind === "group" || r.ok.kind === "console" ? opt({ t: "connect", target: r.ok, card: m[2] || undefined }) : { t: "notFound", name: m[1]! };
  }
  if ((m = s.match(new RegExp(`^(?:(.+?)\\s*(?:용|을\\s*위한|를\\s*위한)\\s*)?오케스트레이터\\s*(?:를|을)?\\s*(?:(?:하나|한\\s*개)\\s*)?(?:${ADD})$`)))) {
    if (!m[1]) return { t: "addOrchestrator" };
    const r = target(m[1], ctx);
    if ("err" in r) return r.err;
    return r.ok.kind === "group" ? { t: "addOrchestrator", groupId: r.ok.id } : { t: "notFound", name: m[1] };
  }
  return null;
}

// ---- 한 마디짜리 말 ----
const X = (re: string): RegExp => new RegExp(`^(?:${re})$`);
const EXACT: [RegExp, Intent][] = [
  [X(String.raw`(?:지금\s*)?(?:상태|상황)(?:\s*(?:알려|보여|말해|확인해?)(?:줘|주세요)?)?요?`), { t: "status" }],
  [X(String.raw`어떻게\s*(?:돼\s*가|돼가|되고\s*있|되어\s*가)\S*`), { t: "status" }],
  [X(String.raw`누가\s*(?:다\s*)?(?:끝났|끝남|끝나)\S*`), { t: "whoFinished" }],
  [X(String.raw`요약(?:${HA})?${T}`), { t: "whoFinished" }],
  [X(String.raw`도움말|도움|헬프|사용법|뭐\s*할\s*수\s*있\S*|뭘\s*할\s*수\s*있\S*|무엇을\s*할\s*수\s*있\S*|뭐라고\s*말하면\s*\S+`), { t: "help" }],
  [X(String.raw`취소(?:${HA})?${T}|됐어요?|됐다|그만(?:둬|해|할래|할게)?${T}`), { t: "cancel" }],
  [X(String.raw`고마워요?|감사(?:합니다|해요|해)|땡큐|안녕(?:하세요|하십니까)?|좋아요?|굿|오케이|알겠어요?|네|응`), { t: "smallTalk" }],
  [X(String.raw`(?:되돌려|되돌리기|실행\s*취소|언두)${T}`), { t: "undo" }],
  [X(String.raw`(?:다시\s*실행|리두)${T}`), { t: "redo" }],
  [X(String.raw`(?:보드\s*정리|정리해)${T}`), { t: "tidy" }],
  [X(String.raw`(?:전체|다|모두|전부|한눈에)\s*(?:보기|보여\s*(?:줘|주세요|줘요))`), { t: "camera", op: "fitAll" }],
  [X(String.raw`(?:확대(?:${HA})?|줌\s*인|줌인|크게)${T}`), { t: "camera", op: "zoomIn" }],
  [X(String.raw`(?:축소(?:${HA})?|줌\s*아웃|줌아웃|작게)${T}`), { t: "camera", op: "zoomOut" }],
  [X(String.raw`줌\s*(?:초기화|리셋)(?:${HA})?${T}`), { t: "camera", op: "reset" }],
  [X(String.raw`(?:(?:지금\s*)?열린\s*(?:거|것|창|패널|화면)|패널|이거|그거|이것|그것|이\s*(?:창|패널)|창)\s*(?:을|를)?\s*(?:${v("닫아", "닫자", "닫기", "닫을래")})`), { t: "closePanel" }],
  [X(String.raw`(?:라이트|밝은|화이트)\s*(?:모드|테마)(?:\s*(?:으로|로))?(?:\s*(?:${v("바꿔", "변경", "전환", "켜")}|${hv("설정", "적용")}))?`), { t: "theme", value: "light" }],
  [X(String.raw`(?:다크|어두운|검은)\s*(?:모드|테마)(?:\s*(?:으로|로))?(?:\s*(?:${v("바꿔", "변경", "전환", "켜")}|${hv("설정", "적용")}))?`), { t: "theme", value: "og" }],
  [X(String.raw`시스템\s*(?:테마|모드|따라가|따라\s*가|따라가기)(?:\s*(?:으로|로))?(?:\s*(?:${v("바꿔", "변경", "전환", "켜", "따라가")}|${hv("설정", "적용")}))?|시스템\s*(?:을\s*)?따라${T}`), { t: "theme", value: "system" }],
  [X(String.raw`커밋(?:하고|해서|하고서)?\s*(?:앤\s*)?푸[시쉬](?:${HA})?${T}`), { t: "git", op: "commitPush" }],
  [X(String.raw`푸[시쉬](?:${HA})?${T}`), { t: "git", op: "push" }],
  [X(String.raw`(?:풀|풀링)(?:${HA})?${T}`), { t: "git", op: "pull" }],
  [X(String.raw`커밋(?:${HA})?${T}`), { t: "git", op: "commit" }],
  [X(String.raw`지우개\S*(?:\s*(?:켜|선택|써|모드|쓸래)\S*)?`), { t: "tool", tool: "eraser" }],
  [X(String.raw`그림\s*(?:을\s*)?(?:그릴래|그려|그리고\s*싶어|그리자|그릴게)\S*|그리기|펜(?:\s*(?:켜|선택|써)\S*)?`), { t: "tool", tool: "pen" }],
];

function gitMsgKo(s: string): Intent | null {
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^커밋\s*메시지\s*(?:는|은|를|을|:|：)?\s*(.+)$/))) return { t: "git", op: "commit", message: m[1]!.trim() };
  if ((m = s.match(new RegExp(`^(?:커밋\\s*)?메시지\\s*(?:는|은|를|을|:|：)?\\s*(.+?)\\s*(?:으로|로)\\s*커밋(?:(?:하고|해서)\\s*푸[시쉬])?(?:${HA})?${T}$`)))) {
    const push = /푸[시쉬]/.test(s);
    return opt({ t: "git", op: push ? "commitPush" : "commit", message: m[1]!.trim() });
  }
  return null;
}

// S-2500: 한국어 일반 작업 문장 (영어의 동사 목록 휴리스틱과 같은 뜻)
const WORK = /(?:고쳐|수정|구현|테스트|돌려|실행|리뷰|검토|확인|작성|써|정리|분석|디버그|리팩터|배포|빌드|설명|요약|조사|찾아)/;

function run(raw: string, ctx: ParseCtx): Intent | null {
  const s0 = raw.replace(/\s+/g, " ").trim().replace(/[\s.!?,;:~。]+$/, "");
  if (!/[가-힣]/.test(s0)) return null;
  const s1 = s0.replace(/^(?:(?:제발|좀|한번|그냥|일단)\s+)+/, ""); // 지시 글 안의 "좀"은 건드리지 않는다
  const sf = s1.replace(/(^|\s)(?:제발|좀|한번)(?=\s|$)/g, "$1").replace(/\s+/g, " ").trim();
  if (/(^|\s)@/.test(s1)) return handoffKo(s1, ctx); // 멘션은 기존 멘션 경로로 (넘기기만 한국어로)

  for (const [re, intent] of EXACT) if (re.test(sf)) return intent;
  return (
    workspaceKo(sf, ctx) ?? loopKo(sf) ?? forwardKo(sf, ctx) ?? handoffKo(sf, ctx) ?? orchKo(sf, ctx) ?? gitMsgKo(sf) ?? addKo(sf) ??
    openKo(sf) ?? startKo(sf, ctx) ?? controlKo(sf, ctx) ?? tellKo(s1, ctx) ??
    (WORK.test(s1) ? { t: "orderUnrouted", text: s1 } : null)
  );
}

/** 한글이 든 입력만 부른다(parser.ts). 던지지 않는다 */
export function parseKo(text: string, ctx: ParseCtx): Intent | null {
  try {
    return run(text, ctx);
  } catch {
    return null;
  }
}
