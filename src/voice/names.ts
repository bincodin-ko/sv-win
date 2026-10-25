// S-2210: 받아쓴 글에서 콘솔 이름과 소리가 비슷한 낱말을 정확한 이름으로 (순수)
import { countOf } from "../commandbar/words";
import { getLang } from "../i18n";
import { ROLES } from "../commandbar/roles";

/** 명령 낱말(파서가 읽는 말) — 이름으로 바꾸지 않고, 받아쓰기 힌트(--prompt)에도 준다 */
export const VOCAB: string[] = [
  "spawn", "group", "ungroup", "pause", "resume", "kill", "restart", "status", "open", "close", "add", "rename", "tell", "broadcast",
  "forward", "handoff", "commit", "push", "pull", "loop", "loops", "memory", "mission", "note", "sticky", "todo", "checklist", "undo",
  "redo", "reset", "help", "theme", "settings", "preferences", "presets", "usage", "shell", "console", "consoles", "agent", "agents",
  "claude", "codex", "gemini", "confirm", "cancel", "clear", "all", "new", "connect", "goto", "workspace", "camera", "eraser", "light",
  "later", "finished", ...ROLES,
];

// 4글자 이상 흔한 영어 낱말(이름으로 바꾸면 안 되는 것). ponytail: 짧은 목록 — 잘못 바뀌는 낱말이 나오면 더한다
const COMMON = new Set(
  ("about after again also back been before being both call came code come could does done down each even every file files find first " +
    "from give going good have here into just keep know last like line look made make many more most much must name need next none only " +
    "other over part please really right said same seem show some still such sure take than that them then there these they thing think " +
    "this those time today very want were what when where which while will with without word work would year your yours okay maybe " +
    "start stop send move test tests list read write line four five nine zero half nope yeah sound right left full done task tasks").split(" "),
);

const lev = (a: string, b: string) => {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j]! + 1, d[j - 1]! + 1, prev! + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length]!;
};

/** 아주 단순한 소리 키: 비슷한 자음을 합치고 첫 글자 뒤 모음·h·w·y 를 빼고 겹친 글자를 줄인다 */
export function soundKey(w: string): string {
  let s = w.toLowerCase().replace(/[^a-z]/g, "").replace(/ph/g, "f").replace(/ck/g, "k").replace(/x/g, "ks").replace(/[cq]/g, "k").replace(/z/g, "s");
  if (!s) return "";
  const first = /[aeiouy]/.test(s[0]!) ? "a" : s[0]!;
  s = first + s.slice(1).replace(/[aeiouyhw]/g, "");
  return s.replace(/(.)\1+/g, "$1");
}

export function snapNames(text: string, names: string[], vocab: string[] = VOCAB): string {
  const protect = new Set(vocab.map((v) => v.toLowerCase()));
  // 1) "Maya 2" / "maya two" → Maya2 (이름 끝 숫자)
  for (const n of names) {
    const m = /^(.*?\D)\s*(\d+)$/.exec(n);
    if (!m) continue;
    const base = m[1]!.toLowerCase();
    const parts = text.split(/(\s+)/); // 낱말, 공백, 낱말, …
    for (let i = 0; i + 2 < parts.length; i += 2) {
      const lw = parts[i]!.toLowerCase();
      const num = /^(\p{L}+|\d+)(\p{P}*)$/u.exec(parts[i + 2]!);
      if (!num || !/^\p{L}+$/u.test(lw)) continue;
      const w2 = num[1]!;
      const k = /^\d+$/.test(w2) ? Number(w2) : /^an?$/i.test(w2) ? null : countOf(w2);
      if (k !== Number(m[2])) continue;
      if (lw === base || (lw.length >= 4 && (lev(lw, base) <= 1 || soundKey(lw) === soundKey(base)))) parts.splice(i, 3, n + num[2]!);
    }
    text = parts.join("");
  }
  // 2) 낱말 하나씩: 같은 글자면 이름 표기로, 4글자 이상이면 편집 거리 ≤1 또는 같은 소리 키
  const exact = new Map(names.map((n) => [n.toLowerCase(), n]));
  const fuzzy = names.filter((n) => !/\d$/.test(n) && n.length >= 3); // 숫자로 끝나는 이름은 1)에서만(Maya2 와 Maya3 를 헷갈리지 않게)
  return text.replace(/\p{L}[\p{L}']*/gu, (w) => {
    const lw = w.toLowerCase();
    const hit = exact.get(lw);
    if (hit) return hit;
    if (lw.length < 4 || protect.has(lw) || COMMON.has(lw)) return w;
    const c = fuzzy.find((n) => lev(lw, n.toLowerCase()) <= 1) ?? fuzzy.find((n) => soundKey(lw) === soundKey(n));
    return c ?? w;
  });
}

/** whisper --prompt 힌트: 콘솔 이름 + 명령 낱말. ponytail: 힌트가 길면 엔진이 앞부분만 쓴다(약 224 토큰) */
const AGENTS = ["Claude Code", "Codex", "Gemini"];
const KO_HINT = ["클로드", "코덱스", "제미나이", "띄워", "그룹"];
/** language: 음성 언어 코드. auto 면 화면 언어. ko 면 한국어 낱말을 맨 앞에 (영어 힌트만 있으면 "클로드"가 close 로 들림) */
export const promptHint = (names: string[], vocab: string[] = VOCAB, language = "auto") => {
  const ko = language === "ko" || (language === "auto" && getLang() === "ko");
  return [...(ko ? KO_HINT : []), ...AGENTS, ...names, ...vocab.slice(0, 20)].join(", ");
};
