import { describe, expect, it } from "vitest";
import { composeSkill, parseSkill } from "./parse";

// 5묶음 E7 S-2072: 머리말 6가지 — 없음·안 닫힘·따옴표·`>` 여러 줄·목록·모르는 키 보존
describe("S-2072 parseSkill", () => {
  it("머리말이 없으면 본문만, 이름은 기본값", () => {
    const p = parseSkill("hello\nworld", "fb");
    expect(p).toMatchObject({ name: "fb", description: "", body: "hello\nworld", hasFrontmatter: false, fields: [] });
  });
  it("안 닫힌 머리말도 터지지 않고 본문만", () => {
    const raw = "---\nname: x\nstill body";
    const p = parseSkill(raw, "fb");
    expect(p.name).toBe("fb");
    expect(p.body).toBe(raw);
    expect(p.fields).toEqual([]);
  });
  it("따옴표 값과 값 안의 콜론", () => {
    const p = parseSkill("---\nname: \"my-skill\"\ndescription: 'Does: things'\n---\nBody", "fb");
    expect(p.name).toBe("my-skill");
    expect(p.description).toBe("Does: things");
    expect(p.body).toBe("Body");
    expect(p.hasFrontmatter).toBe(true);
  });
  it("> 는 공백으로 잇고 | 는 줄바꿈을 지킨다", () => {
    const p = parseSkill("---\ndescription: >\n  line one\n  line two\nwhen_to_use: |\n  a\n  b\nname: n\n---\nB", "fb");
    expect(p.description).toBe("line one line two");
    expect(p.fields.find((f) => f[0] === "when_to_use")?.[1]).toBe("a\nb");
    expect(p.name).toBe("n");
  });
  it("[a, b] 와 - a 목록", () => {
    const p = parseSkill("---\nallowed-tools: [Read, \"Grep\"]\npaths:\n  - a/**\n  - b\n---\nB", "fb");
    expect(p.fields).toEqual([["allowed-tools", ["Read", "Grep"]], ["paths", ["a/**", "b"]]]);
  });
  it("모르는 키도 순서대로 보존한다", () => {
    const p = parseSkill("---\nzeta: 1\nname: n\nalpha: 2\n---\nB", "fb");
    expect(p.fields.map((f) => f[0])).toEqual(["zeta", "name", "alpha"]);
    expect(p.fields[0]).toEqual(["zeta", "1"]);
  });
  it("CRLF 도 읽는다", () => {
    expect(parseSkill("---\r\nname: n\r\n---\r\nBody\r\n", "fb")).toMatchObject({ name: "n", body: "Body\n" });
  });
});

describe("S-2079 composeSkill", () => {
  it("머리말(name·description·argument-hint) + 본문, 다시 읽으면 같다", () => {
    const raw = composeSkill({ name: "n", description: "Does it.", argumentHint: "[file]", body: "Step 1" });
    expect(raw).toBe("---\nname: n\ndescription: Does it.\nargument-hint: [file]\n---\n\nStep 1\n");
    const p = parseSkill(raw, "x");
    expect([p.name, p.description, p.body.trim()]).toEqual(["n", "Does it.", "Step 1"]);
    expect(composeSkill({ name: "n", description: "d", body: "b" })).not.toContain("argument-hint");
  });
});
