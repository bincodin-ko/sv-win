import { expect, it } from "vitest";
import { ROLES } from "./roles";

// S-507·S-521: 영상(node-composer) 순서
it("역할 칩 순서는 영상과 같다", () => {
  expect([...ROLES]).toEqual(["frontend", "backend", "testers", "reviewers", "design", "docs", "security", "general"]);
});
