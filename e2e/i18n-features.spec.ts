import { expect, test, type Page } from "@playwright/test";

// K7 기능 패널 번역 (S-2480~S-2483). PW_PORT=1607. 가짜 설정 localStorage "symvibe.fakeSettings"(language), 가짜 IPC·PTY 는 각 기능 시험과 같다.
// 같은 시나리오를 한국어/영어로 돌려 영어 기본이 그대로임을 본다. 패널 안의 사용자 데이터(콘솔 이름·CLI 화면 글)는 번역하지 않는다.
test.use({ actionTimeout: 5000 });
type N = Record<string, unknown> & { id: string };
const REPO = "C:/fake/repo";
const con = (id: string, x: number, y: number, name = `Con ${id}`): N => ({ id, kind: "console", x, y, w: 720, h: 440, z: 1, name, agentId: "shell", textSize: null, yolo: false });
const C1 = con("c1", -760, -400), C2 = con("c2", 40, -400);
const ORCH: N = { id: "o1", kind: "orchestrator", x: 800, y: -300, w: 380, h: 520, z: 5, name: "Orchestrator", wired: [], collapsed: [] };

const L = {
  en: {
    loops: { head: "TEMPLATES", t0: "Progress check", scratch: "Start from scratch", create: "Create loop", cancel: "Cancel", idle: "When an agent goes idle", summary: "Every 30 min", add: "New loop", count: /^in \d+:\d\d$/ },
    memory: { empty: "No memory yet", add: "New memory", scan: "Scan repo", place: "Place card on board", tab: /^All repos/ },
    mission: { needs: "Needs you", working: "Working", summary: "Mission Map ·", struct: "Orchestrators", since: /\d+s$|\d+m/, hint: "Click a console, team or card to inspect it." },
    usage: { pill: "usage", title: "usage", reset: "resets 4:09pm", left: /left$/, gauge: "14% used", manage: "Manage accounts", foot: "Snapshots from the CLI." },
    orch: { empty: "No agents wired", connect: "Connect", plus: "+ Connect", spawn: "Spawn agent", sub: "0 agents", ph: "Wire an agent to give orders" },
  },
  ko: {
    loops: { head: "템플릿", t0: "진행 확인", scratch: "처음부터 시작", create: "루프 만들기", cancel: "취소", idle: "에이전트가 대기 상태가 되면", summary: "30분마다", add: "새 루프", count: /^\d+:\d\d 후$/ },
    memory: { empty: "아직 메모리가 없어요", add: "새 메모리", scan: "repo 스캔", place: "보드에 카드 놓기", tab: /^모든 repo/ },
    mission: { needs: "확인 필요", working: "작업 중", summary: "미션 맵 ·", struct: "오케스트레이터", since: /\d+초$|\d+분/, hint: "콘솔, 팀, 카드를 눌러 자세히 보세요." },
    usage: { pill: "사용량", title: "사용량", reset: "초기화 4:09pm", left: /남음$/, gauge: "14% 사용", manage: "계정 관리", foot: "CLI가 알려 준 현재 값이에요." },
    orch: { empty: "연결된 에이전트 없음", connect: "연결", plus: "+ 연결", spawn: "에이전트 생성", sub: "에이전트 0개", ph: "명령을 내리려면 에이전트를 연결하세요" },
  },
} as const;

const seed = async (page: Page, lang: "en" | "ko", nodes: N[], win: Record<string, unknown> = {}, ls: Record<string, unknown> = {}) => {
  const board = JSON.stringify({ formatVersion: 1, savedBy: "symvibe-win", workspace: { id: "ws-fake", name: "Workspace 1", repoPath: REPO }, viewport: { x: 0, y: 0, zoom: 0.5 }, nodes, groups: [] });
  await page.addInitScript(([b, s, w, l]) => {
    (window as any).__symSeed = { boards: { "ws-fake": b } };
    localStorage.setItem("symvibe.fakeSettings", JSON.stringify(s));
    (window as any).__loopNow = 1_800_000_000_000;
    Object.assign(window, w);
    for (const [k, v] of Object.entries(l as Record<string, unknown>)) localStorage.setItem(k, JSON.stringify(v));
  }, [board, lang === "ko" ? { language: "ko" } : {}, win, ls] as const);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?kindsTest");
  await expect(page.getByTestId("rail-spawn")).toHaveAttribute("data-armed", /.+/);
  const cons = nodes.filter((n) => n.kind === "console").length;
  await expect(page.getByTestId("console")).toHaveCount(cons);
};
const blank = (page: Page) => page.mouse.click(1300, 100);

for (const lang of ["ko", "en"] as const) {
  const x = L[lang];
  test.describe(`기능 패널 ${lang}`, () => {
    test("① Loops: 템플릿 · 폼 · 목록", async ({ page }) => {
      await seed(page, lang, [C1, C2]);
      await page.evaluate(async () => { await (window as any).__loops.tick(); });
      await page.getByTestId("rail-loops").click();
      await expect(page.getByTestId("loops-empty")).toContainText(x.loops.head);
      await expect(page.getByTestId("loops-template-0")).toContainText(x.loops.t0);
      await expect(page.getByTestId("loops-scratch")).toHaveText(x.loops.scratch);
      await page.getByTestId("loops-template-0").click();
      await expect(page.getByTestId("lf-name")).toHaveValue(x.loops.t0);
      await expect(page.getByTestId("lf-when-idle")).toHaveText(x.loops.idle);
      await expect(page.getByTestId("lf-summary")).toContainText(x.loops.summary);
      await expect(page.getByTestId("lf-cancel")).toHaveText(x.loops.cancel);
      await expect(page.getByTestId("lf-create")).toHaveText(x.loops.create);
      await page.getByTestId("lf-create").click();
      await expect(page.getByTestId("loop-row")).toHaveCount(1);
      await expect(page.getByTestId("loop-countdown")).toHaveText(x.loops.count);
      await expect(page.getByTestId("loops-new")).toHaveText(x.loops.add);
    });

    test("② Memory: 머리 · 탭 · 빈 상태", async ({ page }) => {
      await seed(page, lang, [C1, C2], { __fakeMemory: {} });
      await blank(page);
      await page.keyboard.press("m");
      await expect(page.getByTestId("memory-panel")).toBeVisible();
      await expect(page.getByTestId("memory-empty")).toContainText(x.memory.empty);
      await expect(page.getByTestId("memory-new")).toHaveText(x.memory.add);
      await expect(page.getByTestId("memory-scan")).toHaveText(x.memory.scan);
      await expect(page.getByTestId("memory-place")).toHaveText(x.memory.place);
      await expect(page.getByTestId("memory-tab-all")).toHaveText(x.memory.tab);
    });

    test("③ Mission Map: 필터 · 상태 4개 접기 머리 · 요약 · 경과 시간", async ({ page }) => {
      await seed(page, lang, [C1, C2, ORCH]);
      await blank(page);
      await page.keyboard.press("x");
      await expect(page.getByTestId("mission-map")).toBeVisible();
      await expect(page.getByTestId("mm-summary")).toContainText(x.mission.summary);
      await expect(page.getByTestId("mm-filter-needs")).toHaveText(x.mission.needs);
      await expect(page.getByTestId("mm-agg-working")).toContainText(x.mission.working);
      await expect(page.getByTestId("mm-struct-orchestrators")).toContainText(x.mission.struct);
      await expect(page.getByTestId("mm-inspector-hint")).toHaveText(x.mission.hint);
      await page.getByTestId("mm-console").first().click();
      await expect(page.getByTestId("mm-since")).toHaveText(x.mission.since);
    });

    test("④ Usage pill · popover · 남은 시간", async ({ page }) => {
      const screen = [" Current session", "  ███████        14% used", " Resets 4:09pm (Asia/Seoul)"].join("\n");
      await seed(page, lang, [C1], { __chimeLog: [], __fakeUsage: { screens: { claude: screen }, blocked: [], fail: [], calls: [] }, __fakeTokens: { stats: {} } }, { "symvibe.fakeInstalled": ["codex"] });
      await expect(page.getByTestId("usage-pill")).toContainText(x.usage.pill);
      await page.getByTestId("usage-pill").click();
      await expect(page.getByTestId("usage-title")).toHaveText(x.usage.title);
      await expect(page.getByTestId("usage-pill")).toContainText(x.usage.reset);
      await expect(page.getByTestId("usage-pill")).toHaveAttribute("title", x.usage.left);
      await expect(page.getByTestId("usage-gauge")).toContainText(x.usage.gauge);
      await expect(page.getByTestId("usage-manage-accounts")).toHaveText(x.usage.manage);
      await expect(page.getByTestId("usage-footnote")).toContainText(x.usage.foot);
    });

    test("⑤ Orchestrator 카드: 빈 상태", async ({ page }) => {
      await seed(page, lang, [C1, C2, ORCH]);
      await expect(page.getByTestId("orch-empty")).toContainText(x.orch.empty);
      await expect(page.getByTestId("orch-toggle")).toHaveText(x.orch.connect);
      await expect(page.getByTestId("orch-empty-connect")).toHaveText(x.orch.plus);
      await expect(page.getByTestId("orch-spawn")).toHaveText(x.orch.spawn);
      await expect(page.getByTestId("orch-sub")).toHaveText(x.orch.sub);
      await expect(page.getByTestId("orch-input")).toHaveAttribute("placeholder", x.orch.ph);
    });
  });
}
