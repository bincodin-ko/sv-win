import { describe, expect, it } from "vitest";
import { HUB_HIDDEN, toolsItems } from "./ToolsMenu";

// D1 S-1231: Tools 메뉴 항목 순서 (Code·Markdown·Skills 는 5묶음이 끼움, Chat 은 안 만든다)
describe("S-1231 Tools 메뉴 항목", () => {
  it("스튜디오가 등록되기 전에는 Presets, GitHub, Mission Map, Memory, Loops, Settings 순서(S-1804: 등록된 스튜디오만 나온다)", () => {
    expect(toolsItems.filter((t) => t.when?.() ?? true).map((t) => t.label)).toEqual(["All conversations", "Presets", "GitHub", "Mission Map", "Memory", "Loops", "Settings"]);
  });
  it("S-1804 전체 순서: Code·Markdown 이 GitHub 뒤, Skills 가 Memory 뒤", () => {
    expect(toolsItems.map((t) => t.label)).toEqual(["All conversations", "Presets", "GitHub", "Code", "Markdown", "Mission Map", "Memory", "Skills", "Loops", "Settings"]);
  });
  it("Chat 항목은 없다", () => {
    expect(toolsItems.some((t) => /chat/i.test(t.label))).toBe(false);
  });
  // H5 S-2876: Hub 에서는 폴더가 필요한 항목이 빠진다(Presets·Mission Map·Settings 는 남는다)
  it("S-2876 Hub 에서 숨김: GitHub·Code·Markdown·Memory·Skills·Loops", () => {
    expect(toolsItems.filter((t) => !HUB_HIDDEN.includes(t.id)).map((t) => t.label)).toEqual(["All conversations", "Presets", "Mission Map", "Settings"]);
  });
});
