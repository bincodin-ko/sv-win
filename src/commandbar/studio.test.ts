import { describe, expect, it } from "vitest";
import { UNAVAILABLE } from "./words";
import { parse } from "./parser";
import type { ParseCtx } from "./intent";

const ctx: ParseCtx = { consoles: [], groups: [], workspaces: [], agents: [] };

describe("S-1807 open <스튜디오> 명령", () => {
  it("open documents·code·markdown·skills 는 open 의도(Skills 포함)", () => {
    for (const w of ["documents", "code", "markdown", "skills"]) expect(parse(`open ${w}`, ctx), w).toEqual({ t: "open", what: w });
    expect(parse("Open Code", ctx)).toEqual({ t: "open", what: "code" });
  });
  it("UNAVAILABLE 에서 네 개를 뺐다(github 는 남는다)", () => {
    expect(UNAVAILABLE).toEqual(["github"]);
    expect(parse("open github", ctx)).toEqual({ t: "unavailable", what: "github" });
  });
  it("기존 open 은 그대로", () => {
    expect(parse("open memory", ctx)).toEqual({ t: "open", what: "memory" });
    expect(parse("open settings", ctx)).toEqual({ t: "open", what: "settings" });
  });
});
