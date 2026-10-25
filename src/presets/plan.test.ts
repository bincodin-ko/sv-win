import { describe, expect, it } from "vitest";
import { CONSOLE_H, CONSOLE_W } from "../board/store";
import { GROUP_PAD, groupBounds } from "../board/groups";
import type { BoardNode } from "../board/store";
import { BW, PRESETS, type PresetDef } from "./defs";
import { planDeploy, type PlanOpts } from "./plan";

const by = (n: string): PresetDef => PRESETS.find((p) => p.name === n)!;
const base: PlanOpts = { center: { x: 1000, y: 500 }, defaultAgent: "claude", installed: ["claude", "shell", "codex", "custom:abc"], knownKinds: ["console"] };
const mid = (cs: { x: number; y: number }[]) => {
  const x0 = Math.min(...cs.map((c) => c.x)), x1 = Math.max(...cs.map((c) => c.x + CONSOLE_W));
  const y0 = Math.min(...cs.map((c) => c.y)), y1 = Math.max(...cs.map((c) => c.y + CONSOLE_H));
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
};

describe("S-642 planDeploy", () => {
  it("콘솔 수 = preset 콘솔 수, 그룹은 레인 단위", () => {
    const p = planDeploy(by("Dev HQ"), base);
    expect(p.consoles).toHaveLength(12);
    expect(p.groups).toEqual([{ name: "Frontend", role: "frontend" }, { name: "Backend", role: "backend" }, { name: "Reviewers", role: "reviewers" }]);
    expect(p.consoles.filter((c) => c.group === "Backend")).toHaveLength(4);
  });
  it("덩어리 가운데가 center", () => {
    for (const n of ["Dev HQ", "Pair", "Four Squads"]) {
      const m = mid(planDeploy(by(n), base).consoles);
      expect(Math.abs(m.x - 1000)).toBeLessThanOrEqual(1);
      expect(Math.abs(m.y - 500)).toBeLessThanOrEqual(1);
    }
  });
  it("상대 좌표가 겹치지 않는다 (18개 전부)", () => {
    for (const d of PRESETS) {
      const cs = planDeploy(d, base).consoles;
      for (let i = 0; i < cs.length; i++)
        for (let j = i + 1; j < cs.length; j++) {
          const a = cs[i]!, b = cs[j]!;
          const hit = a.x < b.x + CONSOLE_W && b.x < a.x + CONSOLE_W && a.y < b.y + CONSOLE_H && b.y < a.y + CONSOLE_H;
          expect([d.name, i, j, hit]).toEqual([d.name, i, j, false]);
        }
    }
  });
});

describe("S-643 레인의 에이전트", () => {
  it("손대지 않은 레인은 기본 에이전트", () => {
    expect(new Set(planDeploy(by("Pair"), { ...base, defaultAgent: "codex" }).consoles.map((c) => c.agentId))).toEqual(new Set(["codex"]));
  });
  it("레인을 손대면 그 레인만 바뀐다", () => {
    const p = planDeploy(by("Two Squads"), { ...base, agentOverrides: { 1: "shell" } });
    expect(p.consoles.map((c) => c.agentId)).toEqual(["claude", "claude", "claude", "claude", "shell", "shell", "shell", "shell"]);
  });
  it("알 수 없는 id 는 Claude Code", () => {
    expect(planDeploy(by("Pair"), { ...base, agentOverrides: { 0: "nope" } }).consoles.every((c) => c.agentId === "claude")).toBe(true);
  });
  it("지워진 내 에이전트(custom:…)는 일반 Shell, 있으면 그대로", () => {
    expect(planDeploy(by("Pair"), { ...base, agentOverrides: { 0: "custom:gone" } }).consoles.every((c) => c.agentId === "shell")).toBe(true);
    expect(planDeploy(by("Pair"), { ...base, agentOverrides: { 0: "custom:abc" } }).consoles.every((c) => c.agentId === "custom:abc")).toBe(true);
  });
});

describe("S-641 모르는 타일 종류", () => {
  it("knownKinds 에 없는 kanban/web/orchestrator 는 건너뛰고 skipped 에 나온다", () => {
    const p = planDeploy(by("Dev HQ"), base);
    expect(p.skipped).toEqual(["kanban", "web", "orchestrator"]);
    expect(p.tiles).toEqual([]);
    expect(planDeploy(by("Pair"), base).skipped).toEqual([]);
  });
  it("알려진 종류는 건너뛰지 않고 tiles 에 들어간다", () => {
    const p = planDeploy(by("Squad and Board"), { ...base, knownKinds: ["console", "kanban"], sizes: SIZES });
    expect(p.skipped).toEqual([]);
    expect(p.tiles.map((t) => t.kind)).toEqual(["kanban"]);
  });
});

// S-1160~S-1161 (C18): 타일 크기는 registry 기본 크기, 세로로 쌓되 겹치지 않는다
const SIZES = { kanban: { w: 960, h: 460 }, web: { w: 640, h: 420 } };
const withTiles: PlanOpts = { ...base, knownKinds: ["console", "kanban", "web"], sizes: SIZES };
const rect = (r: { x: number; y: number; w: number; h: number }) => r;
const overlap = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("S-1160·S-1161 타일 계획", () => {
  it("Dev HQ: kanban·web 이 놓이고 orchestrator 만 skipped, 크기는 registry 기본", () => {
    const p = planDeploy(by("Dev HQ"), withTiles);
    expect(p.skipped).toEqual(["orchestrator"]);
    expect(p.tiles.map((t) => [t.kind, t.w, t.h])).toEqual([["kanban", 960, 460], ["web", 640, 420]]);
  });
  it("타일은 세로로 쌓이고(두 번째 y = 첫 y + 첫 높이 + 간격) 칸 가운데 정렬", () => {
    const [k, w] = planDeploy(by("Dev HQ"), withTiles).tiles;
    expect(w!.y).toBeGreaterThanOrEqual(k!.y + 460);
    expect(w!.y - (k!.y + 460)).toBe(24);
    expect(k!.x + 480).toBe(w!.x + 320); // 같은 세로 줄 가운데
  });
  it("18개 전부: 타일끼리·타일과 콘솔이 겹치지 않는다", () => {
    for (const d of PRESETS) {
      const p = planDeploy(d, withTiles);
      const all = [...p.consoles.map((c) => ({ x: c.x, y: c.y, w: CONSOLE_W, h: CONSOLE_H })), ...p.tiles];
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) expect([d.name, i, j, overlap(all[i]!, all[j]!)]).toEqual([d.name, i, j, false]);
    }
  });
  it("덩어리 가운데(타일 포함)가 center", () => {
    const p = planDeploy(by("Dev HQ"), withTiles);
    const all = [...p.consoles.map((c) => ({ x: c.x, y: c.y, w: CONSOLE_W, h: CONSOLE_H })), ...p.tiles];
    const mx = (Math.min(...all.map((r) => r.x)) + Math.max(...all.map((r) => r.x + r.w))) / 2;
    const my = (Math.min(...all.map((r) => r.y)) + Math.max(...all.map((r) => r.y + r.h))) / 2;
    expect(Math.abs(mx - 1000)).toBeLessThanOrEqual(1);
    expect(Math.abs(my - 500)).toBeLessThanOrEqual(1);
  });
  it("타일 옵션이 계획에 실린다", () => {
    expect(planDeploy(by("Bug Hunt"), withTiles).tiles[0]).toMatchObject({ kind: "kanban", opts: { title: "Triage" } });
    expect(planDeploy(by("Squad and Preview"), withTiles).tiles[0]).toMatchObject({ kind: "web", opts: { url: "http://localhost:3000" } });
  });
});

// S-1790~S-1792 (D16): orchestrator 가 놓이고, 칸 높이(BH)를 넘으면 다음 빈 칸으로
const ALL = { ...SIZES, orchestrator: { w: 380, h: 520 } };
const full: PlanOpts = { ...base, knownKinds: ["console", "kanban", "web", "orchestrator"], sizes: ALL };
const BH = 2 * (CONSOLE_H + 24) + 120;

describe("S-1790·S-1791 Dev HQ 칸 배치", () => {
  it("orchestrator 가 놓이고 skipped 는 비어 있다", () => {
    const p = planDeploy(by("Dev HQ"), full);
    expect(p.skipped).toEqual([]);
    expect(p.tiles.map((t) => [t.kind, t.w, t.h])).toEqual([["kanban", 960, 460], ["web", 640, 420], ["orchestrator", 380, 520]]);
  });
  it("kanban·web 은 gx=1 그대로, orchestrator 는 가장 오른쪽 레인 칸(gx=2) 다음 gx=3 맨 위", () => {
    const [k, w, o] = planDeploy(by("Dev HQ"), full).tiles;
    expect(w!.y - (k!.y + 460)).toBe(24);
    expect(o!.y).toBe(k!.y); // 칸 맨 위
    expect(o!.x + 190 - (k!.x + 480)).toBe(2 * BW); // 중심이 gx=1 보다 두 칸 오른쪽 = gx=3
  });
  it("넘치지 않는 preset 은 지금 배치 그대로: 같은 칸에 세로로 쌓고, 칸은 안 옮긴다", () => {
    const [k, o] = planDeploy(by("Sprint Room"), full).tiles;
    expect(o!.y - (k!.y + 460)).toBe(24);
    expect(o!.x + 190 - (k!.x + 480)).toBe(0);
    const [k2, o2] = planDeploy(by("Ship It"), full).tiles;
    expect(o2!.x + 190 - (k2!.x + 480)).toBe(0);
    expect(planDeploy(by("Briefed Squad"), full).tiles).toHaveLength(1);
  });
  it("칸 높이 BH 를 넘는 타일만 옮긴다 (칸반+웹 = 904 <= BH)", () => {
    expect(460 + 24 + 420).toBeLessThanOrEqual(BH);
    expect(460 + 24 + 420 + 24 + 520).toBeGreaterThan(BH);
  });
});

describe("S-1792 불변식: 내장 preset 18개 모두 콘솔·타일·할로가 겹치지 않는다", () => {
  it("planDeploy 결과(registry 기본 크기)", () => {
    for (const d of PRESETS) {
      const p = planDeploy(d, full);
      const items: { id: string; r: { x: number; y: number; w: number; h: number }; halo?: string }[] = [
        ...p.consoles.map((c, i) => ({ id: `c${i}`, r: { x: c.x, y: c.y, w: CONSOLE_W, h: CONSOLE_H } })),
        ...p.tiles.map((t, i) => ({ id: `t${i}`, r: t })),
      ];
      const halos = p.groups.map((g) => {
        const members = p.consoles.filter((c) => c.group === g.name).map((c) => ({ x: c.x, y: c.y, w: CONSOLE_W, h: CONSOLE_H }) as BoardNode);
        return { name: g.name, r: groupBounds(members, GROUP_PAD)! };
      });
      for (let i = 0; i < items.length; i++)
        for (let j = i + 1; j < items.length; j++) expect([d.name, items[i]!.id, items[j]!.id, overlap(items[i]!.r, items[j]!.r)]).toEqual([d.name, items[i]!.id, items[j]!.id, false]);
      for (const h of halos) {
        for (const it of items.filter((x) => x.id.startsWith("t"))) expect([d.name, h.name, it.id, overlap(h.r, it.r)]).toEqual([d.name, h.name, it.id, false]);
        for (const c of p.consoles.filter((c) => c.group !== h.name)) expect([d.name, h.name, overlap(h.r, { x: c.x, y: c.y, w: CONSOLE_W, h: CONSOLE_H })]).toEqual([d.name, h.name, false]);
      }
      for (let i = 0; i < halos.length; i++)
        for (let j = i + 1; j < halos.length; j++) expect([d.name, halos[i]!.name, halos[j]!.name, overlap(halos[i]!.r, halos[j]!.r)]).toEqual([d.name, halos[i]!.name, halos[j]!.name, false]);
    }
  });
});
