import { describe, expect, it } from "vitest";
import type { ParseCtx } from "./intent";
import { parse } from "./parser";

// 11묶음 최종 확인 8번: 명령 동사가 있는데 파서가 못 읽은 문장은 planner 가 켜져 있으면 콘솔로 보내지 않고 planner 로
const base: ParseCtx = { consoles: [], groups: [], workspaces: [], agents: [{ id: "claude", name: "Claude Code", aliases: [] }] };
const on: ParseCtx = { ...base, planner: true };
const NP = { t: "needsPlanner" };

describe("planner 켜짐: 못 읽은 생성 문장은 planner 로", () => {
  it.each([
    "클로드 하나 띄워서 이름을 검토자로",
    "클로드 하나 만들어서 이름을 검토자로 해줘",
    "터미널 열어서 로그인 확인해",
    "spawn a claude and name it reviewer then check the login",
    "check the login then open a new claude and name it reviewer",
    "write a plan and spawn a claude named reviewer",
  ])("%s", (s) => expect(parse(s, on)).toEqual(NP));
  it("planner 꺼짐이면 예전 그대로(콘솔로)", () => {
    expect(parse("클로드 하나 띄워서 이름을 검토자로", base)).toMatchObject({ t: "orderUnrouted" });
    expect(parse("write a plan and spawn a claude named reviewer", base)).toMatchObject({ t: "orderUnrouted" });
  });
  it("동사가 없는 일 문장은 planner 가 켜져도 콘솔로", () => {
    expect(parse("로그인 버그 고쳐", on)).toMatchObject({ t: "orderUnrouted" });
    expect(parse("run the tests and report", on)).toMatchObject({ t: "orderUnrouted" });
  });
  it("보드에 / tell the board 로 분명히 시킨 것은 그대로", () => {
    expect(parse("보드에 로그인 수정해", on)).toMatchObject({ t: "orderUnrouted" });
    expect(parse("tell the board to review the auth flow", on)).toMatchObject({ t: "orderUnrouted" });
  });
});
