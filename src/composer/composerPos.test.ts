import { expect, it } from "vitest";
import { composerTop } from "./composerPos";

// S-2680: top = max(8, 명령줄 윗변 − composer 높이 − 8)
it("S-2680 composerTop", () => {
  expect(composerTop(700, 300)).toBe(392);
  expect(composerTop(200, 300)).toBe(8);
});
