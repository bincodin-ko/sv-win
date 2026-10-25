import { describe, expect, it } from "vitest";
import { NO_FINDINGS, checkup, nameProblem } from "./checkup";
import { parseSkill } from "./parse";

const doc = (front: string, body = "Body line") => `---\n${front}\n---\n${body}`;
const ck = (raw: string, folder = "good-skill") => checkup(parseSkill(raw, folder), folder);
const rules = (raw: string, folder?: string) => ck(raw, folder).map((f) => f.rule);
const GOOD = doc("name: good-skill\ndescription: Does a good thing.");

describe("S-2076 checkup", () => {
  it("깨끗하면 빈 목록, 문구는 정해진 것", () => {
    expect(ck(GOOD)).toEqual([]);
    expect(NO_FINDINGS).toBe("No findings. Name, description and size all look right.");
  });
  it("① 이름: 대문자·밑줄·65자는 걸리고 a-1 은 안 걸린다", () => {
    expect(rules(doc("name: Bad_Name\ndescription: d"), "Bad_Name")).toContain(1);
    expect(rules(doc(`name: ${"a".repeat(65)}\ndescription: d`), "a".repeat(65))).toContain(1);
    expect(rules(doc(`name: ${"a".repeat(64)}\ndescription: d`), "a".repeat(64))).not.toContain(1);
    expect(rules(doc("name: a-1\ndescription: d"), "a-1")).not.toContain(1);
    expect(nameProblem("Bad Name")).toBeTruthy();
    expect(nameProblem("good-1")).toBeNull();
  });
  it("② 설명 없음 / 설명+when_to_use+argument-hint 가 1536자 넘으면", () => {
    expect(rules(doc("name: good-skill"))).toContain(2);
    expect(rules(doc(`name: good-skill\ndescription: ${"a".repeat(1000)}\nwhen_to_use: ${"b".repeat(537)}`))).toContain(2);
    expect(rules(doc(`name: good-skill\ndescription: ${"a".repeat(1000)}\nwhen_to_use: ${"b".repeat(536)}`))).not.toContain(2);
    expect(rules(doc(`name: good-skill\ndescription: ${"a".repeat(1000)}\nwhen_to_use: ${"b".repeat(500)}\nargument-hint: ${"c".repeat(37)}`))).toContain(2);
  });
  it("③ 본문이 비었거나 500줄 초과", () => {
    expect(rules(doc("name: good-skill\ndescription: d", ""))).toContain(3);
    expect(rules(doc("name: good-skill\ndescription: d", "x\n".repeat(501).trimEnd()))).toContain(3);
    expect(rules(doc("name: good-skill\ndescription: d", "x\n".repeat(500).trimEnd()))).not.toContain(3);
  });
  it("④ 이름이 폴더 이름과 다르면 (이름을 안 적었으면 안 걸림)", () => {
    expect(rules(doc("name: other\ndescription: d"), "good-skill")).toContain(4);
    expect(rules(doc("description: d"), "good-skill")).not.toContain(4);
    expect(rules(GOOD)).not.toContain(4);
  });
  it("⑤ 모르는 필드", () => {
    const f = ck(doc("name: good-skill\ndescription: d\nfoo: 1")).filter((x) => x.rule === 5);
    expect(f).toHaveLength(1);
    expect(f[0].field).toBe("foo");
    expect(rules(doc("name: good-skill\ndescription: d\nmodel: opus"))).not.toContain(5);
  });
  it("⑥ 업로드가 거부하는 Claude Code 전용 필드", () => {
    const f = ck(doc("name: good-skill\ndescription: d\nmodel: opus\nallowed-tools: [Read]")).filter((x) => x.rule === 6);
    expect(f.map((x) => x.field).sort()).toEqual(["allowed-tools", "model"]);
    expect(rules(doc("name: good-skill\ndescription: d\nfoo: 1"))).not.toContain(6); // 모르는 키는 ⑤ 만
  });
  it("⑦ 값 안의 꺾쇠 (본문은 괜찮다)", () => {
    expect(rules(doc("name: good-skill\ndescription: use <tag> here"))).toContain(7);
    expect(rules(doc("name: good-skill\ndescription: d\nargument-hint: <file>"))).toContain(7);
    expect(rules(doc("name: good-skill\ndescription: d", "uses <b> and > in body"))).not.toContain(7);
  });
  it("결과는 {level, field, text}", () => {
    const f = ck(doc("description: d", ""))[0];
    expect(Object.keys(f).sort()).toEqual(["field", "level", "rule", "text"]);
    expect(f.text.length).toBeGreaterThan(5);
  });
});
