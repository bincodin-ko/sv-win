import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

// S-361: 화면 코드에 색 하드코딩이 남지 않아야 한다. 테마와 무관한 데이터 색(역할·상태·견본)은 줄에 `theme-fixed` 표시.
const SKIP = ["theme"];
function walk(d: string): string[] {
  return readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    if (statSync(p).isDirectory()) return SKIP.includes(n) ? [] : walk(p);
    return /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
}
it("src 의 색 값(#hex, rgb/rgba)은 var(--…)로만", () => {
  const bad: string[] = [];
  for (const f of walk("src"))
    readFileSync(f, "utf8").split("\n").forEach((raw, i) => {
      const l = raw.replace(/(^|\s)\/\/.*$/, "");
      if (/#[0-9a-f]{3,8}\b|rgba?\(/i.test(l) && !raw.includes("theme-fixed")) bad.push(`${f.split("src")[1]}:${i + 1}`);
    });
  expect(bad).toEqual([]);
});
