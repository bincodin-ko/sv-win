import { beforeEach, describe, expect, it } from "vitest";
import { allStudios, getStudio, registerStudio, resetStudios } from "./registry";

const C = () => null;
beforeEach(() => resetStudios());
describe("S-1800 registry", () => {
  it("order 순으로 돌려주고 id 로 찾는다", () => {
    registerStudio({ id: "skills", title: "Skills", order: 3, Component: C });
    registerStudio({ id: "code", title: "Code", order: 1, Component: C, tools: { label: "Code" } });
    registerStudio({ id: "markdown", title: "Markdown", order: 2, Component: C });
    expect(allStudios().map((s) => s.id)).toEqual(["code", "markdown", "skills"]);
    expect(getStudio("code")?.tools?.label).toBe("Code");
    expect(getStudio("documents")).toBeUndefined();
  });
  it("같은 id 를 다시 등록하면 바꾼다(하나만 남는다)", () => {
    registerStudio({ id: "code", title: "A", order: 1, Component: C });
    registerStudio({ id: "code", title: "B", order: 1, Component: C });
    expect(allStudios().map((s) => s.title)).toEqual(["B"]);
  });
});
