// E3 S-2038: 명세 → PNG (2배, 어두운 배경, 둘레 여백 48). 윤곽은 C5 rough.ts 의 경로를 그대로 쓴다
import { exportWrite, pickSavePath } from "../lib/ipc";
import { linePath, shapePath } from "../board/shapes/rough";
import { fileName, type DiagramSpec } from "./spec";
import { INK_HEX } from "./style";

export const PNG_SCALE = 2;
export const PNG_PAD = 48;
const BG = "#0b0b0d"; // theme-fixed 어두운 테마 보드 색(--bg), 추측
const col = (name: string | undefined) => INK_HEX[name ?? "default"] ?? INK_HEX.default!;

export function pngSize(spec: DiagramSpec): { w: number; h: number } {
  return { w: (spec.layout.width + 2 * PNG_PAD) * PNG_SCALE, h: (spec.layout.height + 2 * PNG_PAD) * PNG_SCALE };
}

export async function renderPng(spec: DiagramSpec): Promise<Uint8Array> {
  const { w, h } = pngSize(spec);
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d")!;
  g.fillStyle = BG;
  g.fillRect(0, 0, w, h);
  g.scale(PNG_SCALE, PNG_SCALE);
  g.translate(PNG_PAD, PNG_PAD);
  g.lineCap = g.lineJoin = "round";
  const { layout: l, paints: pt } = spec;
  const txt = (t: string, cx: number, cy: number, size: number, color: string, bold = false) => {
    g.font = `${bold ? "bold " : ""}${size}px "Segoe UI", system-ui, sans-serif`;
    g.fillStyle = color;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(t, cx, cy);
  };
  const outline = (d: string, x: number, y: number, stroke: string, fill?: string, dash?: number[]) => {
    g.save();
    g.translate(x, y);
    const p = new Path2D(d);
    if (fill) { g.globalAlpha = 0.18; g.fillStyle = fill; g.fill(p); g.globalAlpha = 1; }
    g.strokeStyle = stroke;
    g.lineWidth = 2;
    g.setLineDash(dash ?? []);
    g.stroke(p);
    g.restore();
  };
  let seed = 7;
  for (const z of l.zones) outline(shapePath({ shape: "rectangle", w: z.w, h: z.h, edges: "round", roughness: 1, strokeWidth: 1, seed: seed++ }), z.x, z.y, col(pt.zones[z.group]?.stroke), undefined, [8, 6]);
  txt(l.title.text, l.title.x + l.title.w / 2, l.title.y + l.title.h / 2, 22, col("default"), true);
  for (const n of l.nodes) {
    const c = pt.nodes[n.id], shape = n.node.shape === "ellipse" ? "ellipse" : n.node.shape === "diamond" ? "diamond" : "rectangle";
    outline(shapePath({ shape, w: n.w, h: n.h, edges: n.node.shape === "box" ? "sharp" : "round", roughness: 1, strokeWidth: 1, seed: seed++ }), n.x, n.y, col(c?.stroke), c?.fill && c.fill !== "transparent" ? col(c.fill) : undefined);
    txt(n.node.label, n.x + n.w / 2, n.y + (n.node.note ? n.h / 2 - 8 : n.h / 2), 15, col("default"));
    if (n.node.note) txt(n.node.note, n.x + n.w / 2, n.y + n.h - 14, 11, "#8d8d98"); // theme-fixed
  }
  for (const e of l.edges) {
    const p0 = { x: e.x1, y: e.y1 }, p1 = { x: e.x2, y: e.y2 }, color = col(pt.nodes[e.from]?.stroke);
    outline(linePath({ p0, p1, bend: null, roughness: 1, strokeWidth: 1, seed: seed++ }), 0, 0, color);
    const a = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    g.beginPath(); // 화살촉
    g.moveTo(p1.x - 11 * Math.cos(a - 0.45), p1.y - 11 * Math.sin(a - 0.45));
    g.lineTo(p1.x, p1.y);
    g.lineTo(p1.x - 11 * Math.cos(a + 0.45), p1.y - 11 * Math.sin(a + 0.45));
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.stroke();
    if (e.label) {
      const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;
      g.fillStyle = BG;
      g.fillRect(mx - e.label.length * 3.5 - 4, my - 9, e.label.length * 7 + 8, 18);
      txt(e.label, mx, my, 12, col("default"));
    }
  }
  const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, "image/png"));
  if (!blob) throw new Error("PNG encode failed");
  return new Uint8Array(await blob.arrayBuffer());
}

/** 저장 창 → 쓰기. 취소하면 false */
export async function exportPng(spec: DiagramSpec): Promise<boolean> {
  const path = await pickSavePath(fileName(spec.title, "png"), [{ name: "PNG", extensions: ["png"] }]);
  if (!path) return false;
  await exportWrite(path, await renderPng(spec));
  return true;
}
