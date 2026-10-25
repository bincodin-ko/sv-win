import { describe, expect, it } from "vitest";
import { collisions, type CollideItem } from "./collide";

const it_ = (id: string, scope: CollideItem["scope"], kind: CollideItem["kind"], name: string, plugin?: string): CollideItem => ({ id, scope, kind, name, plugin });

describe("S-2075 이름 겹침", () => {
  it("Personal 이 Project 를 이긴다", () => {
    expect(collisions([it_("a", "personal", "skill", "x"), it_("b", "project", "skill", "x")])).toEqual({ b: "This one never runs: Personal 'x' wins." });
  });
  it("스킬이 명령을 이긴다", () => {
    expect(collisions([it_("c", "project", "command", "x"), it_("s", "project", "skill", "x")])).toEqual({ c: "This one never runs: Project 'x' wins." });
  });
  it("겹치지 않으면 비어 있다", () => {
    expect(collisions([it_("a", "personal", "skill", "x"), it_("b", "project", "skill", "y")])).toEqual({});
  });
  it("플러그인은 플러그인:이름이라 겹치지 않는다", () => {
    expect(collisions([it_("a", "personal", "skill", "x"), it_("p", "plugin", "skill", "x", "ecc"), it_("q", "plugin", "skill", "x", "other")])).toEqual({});
  });
});
