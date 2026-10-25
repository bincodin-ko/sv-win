import { describe, expect, it, vi } from "vitest";
import { setLang, t } from "../i18n";
import { helpText } from "./answers";
import type { Intent, ParseCtx } from "./intent";
import { parse } from "./parser";
import { parseKo } from "./parserKo";

// K8 S-2490~S-2502. 기대값은 spec/7묶음.md §9 예문과 영어 규칙(parser.ts)이 만드는 Intent 모양에서만 가져온다.
const ctx: ParseCtx = {
  consoles: [
    { id: "c1", name: "Otto", agentId: "claude", groupId: "g1" },
    { id: "c2", name: "Mia", agentId: "codex", groupId: "g2" },
    { id: "c3", name: "민수", agentId: "gemini" },
    { id: "c4", name: "유니", agentId: "claude" }, // 이름이 조사처럼 끝난다(S-2501)
  ],
  groups: [
    { id: "g1", name: "Reviewers", role: "reviewers" },
    { id: "g2", name: "Backend", role: "backend" },
    { id: "g3", name: "QA", role: "general" },
  ],
  workspaces: [
    { id: "w1", name: "Main" },
    { id: "w2", name: "QA" },
  ],
  agents: [
    { id: "claude", name: "Claude", aliases: ["claude code"] },
    { id: "codex", name: "Codex", aliases: [] },
    { id: "gemini", name: "Gemini", aliases: [] },
  ],
};
const g = (id: string) => ({ kind: "group", id }) as const;
const c = (id: string) => ({ kind: "console", id }) as const;
const cli = (agentId: string) => ({ kind: "cli", agentId }) as const;
const ALL = { kind: "all" } as const;
const NP: Intent = { t: "needsPlanner" };
const tell = (targets: Extract<Intent, { t: "tell" }>["targets"], text: string): Intent => ({ t: "tell", targets, text });

const table: [string, Intent][] = [
  // S-2490 시작 · 수 낱말 · 단위
  ["클로드 두 개 띄워", { t: "spawn", n: 2, agentId: "claude" }],
  // 받아쓰기 오인식 별칭: '숫자+개' 앞일 때만
  ["clod 2개 띄워주세요", { t: "spawn", n: 2, agentId: "claude" }],
  ["codecs 3개 띄워주세요", { t: "spawn", n: 3, agentId: "codex" }],
  ["클로드 2개 실행해줘", { t: "spawn", n: 2, agentId: "claude" }],
  ["코덱스 세 개 만들어", { t: "spawn", n: 3, agentId: "codex" }],
  ["에이전트 하나 생성해", { t: "spawn", n: 1 }],
  ["리뷰어 두 명 띄워", { t: "spawn", n: 2, agentId: "claude", role: "reviewers" }],
  ["테스터 하나 생성해", { t: "spawn", n: 1, agentId: "gemini", role: "testers" }],
  ["제미니 네 개 시작해", { t: "spawn", n: 4, agentId: "gemini" }],
  ["클로드 다섯 개 띄워줘", { t: "spawn", n: 5, agentId: "claude" }],
  ["클로드 여섯 개 띄워", { t: "spawn", n: 6, agentId: "claude" }],
  ["클로드 일곱 개 띄워", { t: "spawn", n: 7, agentId: "claude" }],
  ["클로드 여덟 개 띄워", { t: "spawn", n: 8, agentId: "claude" }],
  ["클로드 아홉 개 띄워", { t: "spawn", n: 9, agentId: "claude" }],
  ["클로드 열 개 띄워", { t: "spawn", n: 10, agentId: "claude" }],
  ["코덱스 열하나 띄워", { t: "spawn", n: 11, agentId: "codex" }],
  ["클로드 열둘 띄워", { t: "spawn", n: 12, agentId: "claude" }],
  ["클로드 20개 띄워", { t: "spawn", n: 12, agentId: "claude" }],
  ["클로드 0개 띄워", { t: "spawn", n: 1, agentId: "claude" }],
  ["클로드 한 개 띄워 주세요", { t: "spawn", n: 1, agentId: "claude" }],
  ["클로드 띄워", { t: "spawn", n: 1, agentId: "claude" }],
  ["셸 두 개 띄워", { t: "spawn", n: 2, agentId: "shell" }],
  ["코덱스 두 마리 띄우자", { t: "spawn", n: 2, agentId: "codex" }],
  ["제발 클로드 한 대 좀 띄워 줘", { t: "spawn", n: 1, agentId: "claude" }],
  ["클로드 세 개 실행해요", { t: "spawn", n: 3, agentId: "claude" }],
  ["코덱스 두 개 만들어라", { t: "spawn", n: 2, agentId: "codex" }],
  // S-2491 그룹
  ["클로드 세 개로 그룹 만들어", { t: "makeGroup", n: 3, agentId: "claude" }],
  ["그룹 하나 만들어줘", { t: "makeGroup", n: 3 }],
  ["코덱스 두 개 그룹 생성", { t: "makeGroup", n: 2, agentId: "codex" }],
  ["그룹 1에 클로드 하나 추가해", { t: "addToGroup", n: 1, groupId: "g1", agentId: "claude" }],
  ["그룹 2에 에이전트 두 개 추가해", { t: "addToGroup", n: 2, groupId: "g2" }],
  ["리뷰어 그룹에 코덱스 한 개 추가해줘", { t: "addToGroup", n: 1, groupId: "g1", agentId: "codex" }],
  // S-2492 시키기 (text 는 한국어 원문)
  ["@Otto 테스트 돌려", tell([c("c1")], "테스트 돌려")],
  ["@민수 테스트 돌려", tell([c("c3")], "테스트 돌려")],
  ["@Otto @민수 린트 돌려", tell([c("c1"), c("c3")], "린트 돌려")],
  ["Otto한테 테스트 돌려라고 해", tell([c("c1")], "테스트 돌려")],
  ["Otto에게 테스트 돌려 시켜", tell([c("c1")], "테스트 돌려")],
  ["Otto한테는 테스트 돌려", tell([c("c1")], "테스트 돌려")],
  ["리뷰어 그룹에 테스트 돌려", tell([g("g1")], "테스트 돌려")],
  ["리뷰어 그룹한테 린트 돌려줘", tell([g("g1")], "린트 돌려줘")],
  ["그룹 1에 테스트 돌려", tell([g("g1")], "테스트 돌려")],
  ["QA 그룹에 배포해", tell([g("g3")], "배포해")],
  ["민수한테 로그인 버그 고쳐라고 말해", tell([c("c3")], "로그인 버그 고쳐")],
  ["유니에게 빌드 확인해줘", tell([c("c4")], "빌드 확인해줘")],
  ["유니한테 테스트 돌려", tell([c("c4")], "테스트 돌려")],
  ["Mia와 Otto에게 린트 돌려", tell([c("c2"), c("c1")], "린트 돌려")],
  ["클로드에 테스트 돌려", tell([cli("claude")], "테스트 돌려")],
  ["Bob한테 테스트 돌려", { t: "notFound", name: "Bob" }],
  // S-2493 모두에게 · 보드에게
  ["모두에게 테스트 돌려", tell([ALL], "테스트 돌려")],
  ["전부 테스트 돌려", tell([ALL], "테스트 돌려")],
  ["다들 린트 돌려", tell([ALL], "린트 돌려")],
  ["전원에게 같은 지시: 테스트 돌려", { t: "broadcast", text: "테스트 돌려" }],
  ["보드에 로그인 수정해", { t: "orderUnrouted", text: "로그인 수정해" }],
  // S-2494 제어
  ["Otto 멈춰", { t: "pause", target: c("c1") }],
  ["Otto 일시 중지", { t: "pause", target: c("c1") }],
  ["전부 멈춰", { t: "pause", target: ALL }],
  ["멈춰", { t: "pause", target: ALL }],
  ["민수 멈춰줘", { t: "pause", target: c("c3") }],
  ["리뷰어 그룹 멈춰", { t: "pause", target: g("g1") }],
  ["Otto 계속해", { t: "resume", target: c("c1") }],
  ["Otto 재개", { t: "resume", target: c("c1") }],
  ["다시 진행해", { t: "resume", target: ALL }],
  ["전부 재개", { t: "resume", target: ALL }],
  ["Otto 다시 시작", { t: "restart", target: c("c1") }],
  ["Otto 재시작", { t: "restart", target: c("c1") }],
  ["Otto 닫아", { t: "close", target: c("c1") }],
  ["Otto 종료", { t: "close", target: c("c1") }],
  ["Otto 꺼", { t: "close", target: c("c1") }],
  ["Otto 지워", { t: "close", target: c("c1") }],
  ["그룹 1 닫아줘", { t: "close", target: g("g1") }],
  ["유니를 종료해", { t: "close", target: c("c4") }],
  // S-2495 질문 · 도움
  ["상태", { t: "status" }],
  ["어떻게 돼 가?", { t: "status" }],
  ["지금 상황", { t: "status" }],
  ["누가 끝났어?", { t: "whoFinished" }],
  ["누가 끝남", { t: "whoFinished" }],
  ["요약해 줘", { t: "whoFinished" }],
  ["도움말", { t: "help" }],
  ["뭘 할 수 있어?", { t: "help" }],
  ["뭐라고 말하면 돼?", { t: "help" }],
  ["취소", { t: "cancel" }],
  ["취소해", { t: "cancel" }],
  ["됐어", { t: "cancel" }],
  ["그만", { t: "cancel" }],
  ["고마워", { t: "smallTalk" }],
  ["감사합니다", { t: "smallTalk" }],
  ["안녕", { t: "smallTalk" }],
  ["안녕하세요", { t: "smallTalk" }],
  ["좋아", { t: "smallTalk" }],
  // S-2496 카메라 · 열기
  ["전체 보기", { t: "camera", op: "fitAll" }],
  ["다 보여줘", { t: "camera", op: "fitAll" }],
  ["확대", { t: "camera", op: "zoomIn" }],
  ["줌 인", { t: "camera", op: "zoomIn" }],
  ["축소", { t: "camera", op: "zoomOut" }],
  ["줌 아웃", { t: "camera", op: "zoomOut" }],
  ["줌 초기화", { t: "camera", op: "reset" }],
  ["Otto로 가", { t: "camera", op: "goto", target: c("c1") }],
  ["Otto로 이동", { t: "camera", op: "goto", target: c("c1") }],
  ["Otto 보여줘", { t: "camera", op: "goto", target: c("c1") }],
  ["민수로 이동해", { t: "camera", op: "goto", target: c("c3") }],
  ["클로드 레인 보여줘", { t: "camera", op: "cliLanes", target: cli("claude") }],
  ["설정 열어", { t: "open", what: "settings" }],
  ["프리셋 열어", { t: "open", what: "presets" }],
  ["메모리 열어", { t: "open", what: "memory" }],
  ["루프 열어", { t: "open", what: "loops" }],
  ["미션 맵 열어", { t: "open", what: "mission" }],
  ["사용량 열어", { t: "open", what: "usage" }],
  ["문서 열어", { t: "open", what: "documents" }],
  ["코드 열어", { t: "open", what: "code" }],
  ["마크다운 열어", { t: "open", what: "markdown" }],
  ["스킬 열어", { t: "open", what: "skills" }],
  // H2 S-2821
  ["대화 목록 열어", { t: "open", what: "conversations" }],
  ["모든 대화 열어", { t: "open", what: "conversations" }],
  ["대화 목록", { t: "open", what: "conversations" }],
  ["모든 대화", { t: "open", what: "conversations" }],
  ["지금 열린 거 닫아", { t: "closePanel" }],
  ["패널 닫아", { t: "closePanel" }],
  ["localhost 3000 열어", { t: "openWeb", url: "http://localhost:3000" }],
  ["https://example.com 열어", { t: "openWeb", url: "https://example.com" }],
  ["깃허브 열어", { t: "unavailable", what: "github" }],
  // S-2497 워크스페이스 · 화면 설정
  ["새 워크스페이스 QA", { t: "workspace", op: "new", name: "QA" }],
  ["QA라는 워크스페이스 만들어", { t: "workspace", op: "new", name: "QA" }],
  ["새 워크스페이스 만들어", { t: "workspace", op: "new" }],
  ["워크스페이스 2로 가", { t: "workspace", op: "go", ref: "w2" }],
  ["QA 워크스페이스로 이동", { t: "workspace", op: "go", ref: "w2" }],
  ["이 워크스페이스 이름을 Docs로 바꿔", { t: "workspace", op: "rename", name: "Docs" }],
  ["워크스페이스 2 닫아", { t: "workspace", op: "close", ref: "w2" }],
  ["라이트 모드", { t: "theme", value: "light" }],
  ["밝은 모드", { t: "theme", value: "light" }],
  ["다크 모드", { t: "theme", value: "og" }],
  ["어두운 모드", { t: "theme", value: "og" }],
  ["시스템 테마", { t: "theme", value: "system" }],
  ["시스템 따라가", { t: "theme", value: "system" }],
  ["되돌려", { t: "undo" }],
  ["실행 취소", { t: "undo" }],
  ["다시 실행", { t: "redo" }],
  ["보드 정리", { t: "tidy" }],
  ["정리해", { t: "tidy" }],
  ["정리해줘", { t: "tidy" }],
  // S-2498 Git · 추가 · 도구
  ["커밋하고 푸시", { t: "git", op: "commitPush" }],
  ["커밋 푸시", { t: "git", op: "commitPush" }],
  ["푸시", { t: "git", op: "push" }],
  ["풀", { t: "git", op: "pull" }],
  ["커밋", { t: "git", op: "commit" }],
  ["커밋 메시지는 로그인 수정", { t: "git", op: "commit", message: "로그인 수정" }],
  ["메시지 로그인 수정으로 커밋", { t: "git", op: "commit", message: "로그인 수정" }],
  ["메모 추가해: 배포하기", { t: "add", what: "note", text: "배포하기" }],
  ["메모 하나 추가해 배포하기라고 적어", { t: "add", what: "note", text: "배포하기" }],
  ["칸반 추가", { t: "add", what: "kanban" }],
  ["캘린더 추가", { t: "add", what: "calendar" }],
  ["체크리스트 추가", { t: "add", what: "checklist" }],
  ["할 일 추가", { t: "add", what: "checklist" }],
  ["브라우저 추가", { t: "add", what: "browser" }],
  ["웹 추가", { t: "add", what: "browser" }],
  ["지우개", { t: "tool", tool: "eraser" }],
  ["그림 그릴래", { t: "tool", tool: "pen" }],
  // S-2499 주기 · 넘기기 · 오케스트레이터
  ["10분마다 테스트 돌려", { t: "loop", minutes: 10, text: "테스트 돌려" }],
  ["한 시간마다 빌드 확인해", { t: "loop", minutes: 60, text: "빌드 확인해" }],
  ["2시간마다 빌드 확인해", { t: "loop", minutes: 120, text: "빌드 확인해" }],
  ["30초마다 테스트 돌려", { t: "loop", bad: "range" }],
  ["10분마다", { t: "loop", bad: "empty" }],
  ["이 작업을 코덱스에 넘겨", { t: "handoff", agentId: "codex" }],
  ["그룹 1이 끝나면 전부 그룹 2에 넘겨", { t: "forward", sources: [g("g1")], dests: [g("g2")] }],
  ["그룹 1용 오케스트레이터 추가", { t: "addOrchestrator", groupId: "g1" }],
  ["오케스트레이터 추가해", { t: "addOrchestrator" }],
  ["그룹 1을 오케스트레이터에 연결", { t: "connect", target: g("g1") }],
  // S-2500 일반 작업 문장 휴리스틱 · 못 알아들음 · 대상 없음
  ["로그인 버그 고쳐", { t: "orderUnrouted", text: "로그인 버그 고쳐" }],
  ["테스트 돌려", { t: "orderUnrouted", text: "테스트 돌려" }],
  ["코드 리뷰해줘", { t: "orderUnrouted", text: "코드 리뷰해줘" }],
  ["블라블라", NP],
  ["오늘 날씨 어때", NP],
  ["ㅋㅋㅋ", NP],
  ["클로드", NP],
  ["열어", NP],
  ["닫아", NP],
  ["Bob 멈춰", { t: "notFound", name: "Bob" }],
  ["그룹 9 멈춰", { t: "notFound", name: "group 9" }],
  ["워크스페이스 9로 가", { t: "notFound", name: "workspace 9" }],
];

describe("S-2502 한국어 예문 표", () => {
  it("예문이 80개 이상이다", () => expect(table.length).toBeGreaterThanOrEqual(80));
  for (const [text, want] of table) it(text, () => expect(parse(text, ctx)).toEqual(want));
});

describe("S-2492·S-2500 모호함과 끝 구두점", () => {
  const dup: ParseCtx = { ...ctx, groups: [{ id: "g1", name: "A", role: "reviewers" }, { id: "g2", name: "B", role: "reviewers" }] };
  it("같은 역할 그룹이 둘이면 ambiguous", () => {
    expect(parse("리뷰어 그룹 멈춰", dup)).toMatchObject({ t: "ambiguous", candidates: ["g1", "g2"] });
  });
  it("끝 구두점·여분 공백은 무시", () => {
    expect(parse("  클로드   두 개 띄워!! ", ctx)).toEqual({ t: "spawn", n: 2, agentId: "claude" });
    expect(parse("Otto 멈춰요.", ctx)).toEqual({ t: "pause", target: c("c1") });
  });
  it("parseKo 는 한국어가 아니면 null, 던지지 않는다", () => {
    expect(parseKo("spawn two claude", ctx)).toBeNull();
    expect(parseKo("", ctx)).toBeNull();
    expect(() => parseKo("ㅁㄴㅇㄹ @@ ?? 한글", ctx)).not.toThrow();
  });
});

describe("S-2502 영어 입력은 한국어 규칙을 타지 않는다", () => {
  it("한글이 없는 200개 문장에서 parseKo 를 부르지 않는다(결과가 이전과 같다)", async () => {
    vi.resetModules();
    const spy = vi.fn(() => null);
    vi.doMock("./parserKo", () => ({ parseKo: spy }));
    const { parse: p } = await import("./parser");
    const verbs = ["spawn", "pause", "resume", "close", "restart", "status", "tell", "go to", "focus", "open", "run", "fix", "add a note", "commit", "zoom in", "help", "undo", "who finished", "every 10 minutes", "hand off to"];
    const objs = ["Otto", "Mia", "group 1", "two claude", "everyone", "the tests", "settings", "memory", "codex", "workspace 2"];
    let n = 0;
    for (const v of verbs) for (const o of objs) { p(`${v} ${o}`, ctx); n++; }
    expect(n).toBe(200);
    expect(spy).not.toHaveBeenCalled();
    p("민수 멈춰", ctx);
    expect(spy).toHaveBeenCalledOnce();
    vi.doUnmock("./parserKo");
    vi.resetModules();
  });
});

describe("S-2520 한국어 도움말 예문은 전부 해석된다", () => {
  it("helpText()의 예문이 needsPlanner 가 아니다", () => {
    setLang("ko");
    try {
      const lines = helpText().split("\n").slice(1, -1); // 마지막 줄은 planner 안내(S-2985), 명령 예문이 아니다
      const examples = lines.flatMap((l) => l.replace(/^•\s*/, "").split(" · "));
      expect(examples.length).toBeGreaterThanOrEqual(30);
      const bad = examples.filter((e) => parse(e, ctx).t === "needsPlanner");
      expect(bad).toEqual([]);
      expect(helpText().startsWith(t("Here is what I can do:"))).toBe(true);
    } finally {
      setLang("en");
    }
  });
});
