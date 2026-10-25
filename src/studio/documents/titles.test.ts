import { describe, expect, it } from "vitest";
import type { DocMeta } from "../../lib/ipc";
import { agentName, agentRow, effortName, firstHeading, fmtElapsed, freeTitle, repoName, versionLabel, versionTitle } from "./titles";

describe("S-1986 제목", () => {
  it("repoName: 마지막 폴더 이름(끝 슬래시·역슬래시 무시)", () => {
    expect(repoName("C:\\Users\\me\\votelanding")).toBe("votelanding");
    expect(repoName("C:/Users/me/votelanding/")).toBe("votelanding");
  });
  it("'<repo 이름> <문서 이름>' (예 Votelanding Project Overview)", () => {
    expect(versionTitle("votelanding", "overview")).toBe("Votelanding Project Overview");
    expect(versionTitle("api", "data-model")).toBe("Api Data Model");
  });
  it("S-1975: 자유 요청의 제목은 글의 첫 # 제목(요청 앞 40자가 아니라)", () => {
    expect(firstHeading("intro\n# Migration Plan\n## Step 1")).toBe("Migration Plan");
    expect(firstHeading("## only h2")).toBeNull();
    expect(freeTitle("# REST to GraphQL\nbody")).toBe("REST to GraphQL");
  });
  it("자유 요청 글에 # 제목이 없으면 Custom document", () => {
    expect(freeTitle("just text")).toBe("Custom document");
  });
});

describe("S-1988 버전 줄", () => {
  const m: DocMeta = { id: "a", docId: "readme", title: "t", agent: "claude", effort: "balanced", startedAt: new Date(2026, 9, 24, 14, 3).getTime(), durationMs: 1, status: "complete" };
  it("Oct 24, 14:03 · Claude Code · Balanced", () => {
    expect(versionLabel(m)).toBe("Oct 24, 14:03 · Claude Code · Balanced");
    expect(versionLabel({ ...m, agent: "codex", effort: "thorough" })).toBe("Oct 24, 14:03 · Codex · Thorough");
  });
  it("에이전트·노력 이름", () => {
    expect(agentName("claude")).toBe("Claude Code");
    expect(agentName("codex")).toBe("Codex");
    expect(effortName("quick")).toBe("Quick");
  });
});

describe("S-1980 진행 시간", () => {
  it("초 단위, 1분 넘으면 분+초", () => {
    expect(fmtElapsed(0)).toBe("0s");
    expect(fmtElapsed(72000)).toBe("1m 12s");
    expect(fmtElapsed(59999)).toBe("59s");
    expect(fmtElapsed(120000)).toBe("2m 0s");
  });
});

describe("S-1972 에이전트 줄", () => {
  const list = [{ id: "shell", installed: true }, { id: "claude", installed: true }, { id: "codex", installed: false }, { id: "gemini", installed: true }];
  it("Claude Code·Codex 만(Gemini·Shell 안 보임), 설치 안 된 것도 보이되 installed false(흐림)", () => {
    expect(agentRow(list, "claude")).toEqual([{ id: "claude", name: "Claude Code", installed: true }, { id: "codex", name: "Codex", installed: false }]);
  });
  it("기본 에이전트가 둘 중 하나면 맨 앞", () => {
    expect(agentRow(list, "codex").map((a) => a.id)).toEqual(["codex", "claude"]);
  });
  it("기본 에이전트가 gemini 면 원래 순서(Claude Code, Codex)", () => {
    expect(agentRow(list, "gemini").map((a) => a.id)).toEqual(["claude", "codex"]);
  });
  it("목록에 없는 에이전트는 설치 안 된 것으로 보인다", () => {
    expect(agentRow([{ id: "claude", installed: true }], "claude")).toEqual([{ id: "claude", name: "Claude Code", installed: true }, { id: "codex", name: "Codex", installed: false }]);
  });
});
