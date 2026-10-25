import { describe, expect, it } from "vitest";
import { accountRows, initials } from "./profiles";

const P = (id: string, name: string, agent: "claude" | "codex" = "claude") => ({ id, agent, name, createdAt: "t" });

// S-1627 이니셜 1~2자
describe("initials", () => {
  it("두 단어면 머리글자 둘, 한 단어면 첫 글자 하나(대문자)", () => {
    expect(initials("Personal Max")).toBe("PM");
    expect(initials("work")).toBe("W");
    expect(initials("  a  b  c ")).toBe("AB");
  });
  it("빈 이름은 빈 문자열", () => {
    expect(initials("  ")).toBe("");
  });
});

// S-1622·S-1624 행 목록
describe("accountRows", () => {
  const list = [P("work", "Work"), P("home", "Home"), P("x", "Codex One", "codex")];
  it("첫 줄은 Your sign-in, 그 에이전트 프로필만 뒤따른다", () => {
    const r = accountRows(list, "claude", null, {});
    expect(r.map((x) => x.name)).toEqual(["Your sign-in", "Work", "Home"]);
    expect(r[0]).toMatchObject({ id: null, sub: "Powering new Claude lanes" });
    expect(accountRows(list, "codex", null, {})[0]!.sub).toBe("Powering new Codex lanes");
  });
  it("안 골랐으면(null) 기본 로그인이 ACTIVE", () => {
    expect(accountRows(list, "claude", null, {}).map((x) => x.active)).toEqual([true, false, false]);
    expect(accountRows(list, "claude", undefined, {})[0]!.active).toBe(true);
  });
  it("프로필을 골랐으면 그 행만 ACTIVE, 목록에 없는 id 면 기본 로그인", () => {
    expect(accountRows(list, "claude", "home", {}).map((x) => x.active)).toEqual([false, false, true]);
    expect(accountRows(list, "claude", "gone", {})[0]!.active).toBe(true);
  });
  it("부제: 로그인 파일 있음 = Ready when you need it, 없음 = Not signed in yet", () => {
    const r = accountRows(list, "claude", null, { "claude/work": true });
    expect(r[1]!.sub).toBe("Ready when you need it");
    expect(r[2]!.sub).toBe("Not signed in yet");
  });
});
