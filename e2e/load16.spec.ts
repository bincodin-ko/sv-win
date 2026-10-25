import { expect, test } from "@playwright/test";

test("?load16: 16개 터미널에 각 1MB flood가 15초 안에 끝나고 rAF 중앙값 < 50ms", async ({ page }) => {
  await page.goto("/?load16");
  await expect(page.locator(".xterm")).toHaveCount(16);
  // 브리프: WebGL 애드온은 지금 켠다 → 16개 모두 WebGL 캔버스로 그리는지(DOM 렌더러로 빠지면 측정이 다름)
  await expect.poll(() => page.locator(".xterm-screen canvas").count()).toBeGreaterThanOrEqual(16);
  const r = await page.evaluate(async () => {
    const w = window as any;
    const gaps: number[] = [];
    let last = performance.now();
    let on = true;
    const tick = (t: number) => {
      gaps.push(t - last);
      last = t;
      if (on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const t0 = performance.now();
    const ids: number[] = w.__fakePty.ids();
    await Promise.all(ids.map((id) => w.__fakePty.flood(id, 1 << 20)));
    // 모든 터미널이 끝 표시까지 그렸는지(xterm 파서가 다 처리했는지)
    const shown = (id: number) => {
      const b = w.__terms.get(id).buffer.active;
      for (let y = b.length - 1; y >= Math.max(0, b.length - 5); y--)
        if (b.getLine(y)?.translateToString(true).includes(`DONE-${id}`)) return true;
      return false;
    };
    while (!ids.every(shown) && performance.now() - t0 < 15_000) await new Promise((r) => setTimeout(r, 50));
    on = false;
    const ms = performance.now() - t0;
    const s = gaps.slice(1).sort((a, b) => a - b);
    return { n: ids.length, all: ids.every(shown), ms, median: s[Math.floor(s.length / 2)] ?? 999 };
  });
  console.log("load16", JSON.stringify(r));
  expect(r.n).toBe(16);
  expect(r.all).toBe(true);
  expect(r.ms).toBeLessThan(15_000);
  expect(r.median).toBeLessThan(50);
});
