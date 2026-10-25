import { describe, expect, it } from "vitest";
import { composeMarkup, type CanvasLike } from "./compose";
import type { MarkEl } from "./draw";

// S-886·S-888: 원본 해상도로 합성, 원본은 불변
function fakeCanvas() {
  const log: string[] = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get: (t, k) => (k in t ? t[k as string] : (...a: unknown[]) => void log.push(`${String(k)}(${a.join(",")})`)),
    set: (t, k, v) => { t[k as string] = v; log.push(`${String(k)}=${v}`); return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx, toBlob: (cb: (b: unknown) => void) => cb({ arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer }) };
  return { canvas, log };
}
const el = (tool: MarkEl["tool"], pts: [number, number][], extra: Partial<MarkEl> = {}): MarkEl => ({ tool, color: "#f00", width: 4, pts: pts.map(([x, y]) => ({ x, y })), ...extra });

describe("composeMarkup", () => {
  it("캔버스는 원본 해상도, 첫 그리기는 원본 이미지를 (0,0)에", async () => {
    const f = fakeCanvas();
    const out = await composeMarkup({ image: {}, nw: 1920, nh: 1080, elements: [el("line", [[0, 0], [10, 10]])], makeCanvas: (w, h) => { f.canvas.width = w; f.canvas.height = h; return f.canvas as unknown as CanvasLike; } });
    expect(f.canvas.width).toBe(1920);
    expect(f.canvas.height).toBe(1080);
    expect(f.log[0]).toBe("drawImage([object Object],0,0)");
    expect(f.log.some((l) => l.startsWith("stroke"))).toBe(true);
    expect(Array.from(out)).toEqual([137, 80, 78, 71]);
  });
  it("요소가 없어도 원본 그림 그대로 PNG 로", async () => {
    const f = fakeCanvas();
    const out = await composeMarkup({ image: {}, nw: 10, nh: 5, elements: [], makeCanvas: () => f.canvas as unknown as CanvasLike });
    expect(f.log.filter((l) => l.startsWith("drawImage"))).toHaveLength(1);
    expect(out.length).toBe(4);
  });
  it("Highlight 는 알파 0.35 로 그리고 그 뒤 되돌린다", async () => {
    const f = fakeCanvas();
    await composeMarkup({ image: {}, nw: 100, nh: 100, elements: [el("highlight", [[0, 0], [50, 0]])], makeCanvas: () => f.canvas as unknown as CanvasLike });
    const a = f.log.indexOf("globalAlpha=0.35");
    expect(a).toBeGreaterThan(-1);
    expect(f.log.slice(a).some((l) => l.startsWith("restore"))).toBe(true);
  });
  it("원본 요소 목록은 바뀌지 않는다 (얼려도 던지지 않음)", async () => {
    const f = fakeCanvas();
    const els = Object.freeze([Object.freeze(el("rectangle", [[1, 1], [20, 20]])), Object.freeze(el("text", [[5, 5]], { text: "6" }))]) as unknown as MarkEl[];
    await expect(composeMarkup({ image: {}, nw: 50, nh: 50, elements: els, makeCanvas: () => f.canvas as unknown as CanvasLike })).resolves.toBeInstanceOf(Uint8Array);
    expect(f.log.some((l) => l.startsWith("fillText(6,5,5"))).toBe(true);
  });
  it("scale 는 선 굵기에 곱해진다", async () => {
    const f = fakeCanvas();
    await composeMarkup({ image: {}, nw: 100, nh: 100, scale: 3, elements: [el("line", [[0, 0], [50, 0]], { width: 4 })], makeCanvas: () => f.canvas as unknown as CanvasLike });
    expect(f.log).toContain("lineWidth=12");
  });
});
