import { describe, expect, it } from "vitest";
import { accept, candidates, mentionAt, mentionOnly, type MentionCtx } from "./mention";

const ctx: MentionCtx = {
  consoles: [{ name: "Otto", agent: "claude" }, { name: "Dax", agent: "codex" }, { name: "Maya", agent: "shell" }],
  groups: [{ name: "Reviewers" }, { name: "Group 2" }],
};
const labels = (q: string) => candidates(ctx, q).map((c) => c.label);

describe("S-550 mentionAt", () => {
  it("커서 앞의 @글자를 찾는다", () => {
    expect(mentionAt("@", 1)).toEqual({ start: 0, query: "" });
    expect(mentionAt("hi @ot", 6)).toEqual({ start: 3, query: "ot" });
    expect(mentionAt("@ot", 2)).toEqual({ start: 0, query: "o" }); // 커서 앞까지만
  });
  it("공백이 끼면·단어 중간의 @면 없다", () => {
    expect(mentionAt("@Otto run", 9)).toBeNull();
    expect(mentionAt("a@b", 3)).toBeNull();
    expect(mentionAt("plain", 5)).toBeNull();
  });
});

describe("S-550 candidates", () => {
  it("빈 글자면 everyone → 콘솔 → 그룹 순으로 전부", () => {
    expect(labels("")).toEqual(["everyone", "Otto", "Dax", "Maya", "Reviewers", "Group 2"]);
  });
  it("콘솔 후보에는 에이전트가 붙는다", () => {
    expect(candidates(ctx, "ot")[0]).toMatchObject({ kind: "console", label: "Otto", hint: "claude" });
    expect(candidates(ctx, "rev")[0]).toMatchObject({ kind: "group", label: "Reviewers" });
  });
  it("대소문자 무시, 이름 앞부분이나 단어 앞부분으로 거른다", () => {
    expect(labels("OT")).toEqual(["Otto"]);
    expect(labels("2")).toEqual(["Group 2"]);
    expect(labels("zzz")).toEqual([]);
  });
  it("S-552 all·everybody 도 everyone 을 고른다", () => {
    expect(labels("all")).toEqual(["everyone"]);
    expect(labels("everyb")).toEqual(["everyone"]);
    expect(labels("ev")).toEqual(["everyone"]);
  });
});

describe("S-550 accept", () => {
  it("@글자를 @이름 + 공백으로 바꾸고 커서를 뒤에 둔다", () => {
    const t = candidates(ctx, "ot")[0]!;
    expect(accept("hi @ot", 6, 3, t)).toEqual({ text: "hi @Otto ", caret: 9 });
    expect(accept("@", 1, 0, t)).toEqual({ text: "@Otto ", caret: 6 });
  });
  it("커서 뒤 글은 그대로 두고 공백이 이미 있으면 겹치지 않는다", () => {
    const t = candidates(ctx, "")[0]!;
    expect(accept("@ run tests", 1, 0, t)).toEqual({ text: "@everyone run tests", caret: 10 });
  });
});

describe("S-551 mentionOnly", () => {
  it("멘션만 있으면 첫 이름", () => {
    expect(mentionOnly("@Otto", ctx)).toBe("Otto");
    expect(mentionOnly("  @Otto  ", ctx)).toBe("Otto");
    expect(mentionOnly("@Otto @Dax", ctx)).toBe("Otto");
    expect(mentionOnly("@everyone", ctx)).toBe("everyone");
    expect(mentionOnly("@all", ctx)).toBe("everyone");
  });
  it("뒤에 내용이 있거나 멘션이 없으면 null", () => {
    expect(mentionOnly("@Otto run the tests", ctx)).toBeNull();
    expect(mentionOnly("run @Otto", ctx)).toBeNull();
    expect(mentionOnly("pause all", ctx)).toBeNull();
    expect(mentionOnly("", ctx)).toBeNull();
  });
  it("공백이 든 이름도 이름 전체를 멘션으로 본다", () => {
    const c2: MentionCtx = { consoles: [{ name: "Otto 2", agent: "claude" }], groups: [] };
    expect(mentionOnly("@Otto 2", c2)).toBe("Otto 2");
    expect(mentionOnly("@Otto 2 go", c2)).toBeNull();
  });
});
