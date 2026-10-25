// S-886·S-888: 원본 이미지 + 요소 → 원본 해상도 PNG 바이트. 원본은 건드리지 않는다
import { allCommands, type Cmd, type MarkEl } from "./draw";

type Ctx = Record<string, any>;
export type CanvasLike = { width: number; height: number; getContext(k: "2d"): Ctx | null; toBlob(cb: (b: { arrayBuffer(): Promise<ArrayBuffer> } | null) => void, type?: string): void };

/** 명령을 ctx 에 그린다 */
export function paintCommands(ctx: Ctx, cmds: Cmd[]): void {
  for (const c of cmds) {
    ctx.save();
    ctx.globalAlpha = c.alpha;
    if (c.t === "text") {
      ctx.fillStyle = c.color;
      ctx.font = `bold ${c.size}px system-ui, sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText(c.text, c.x, c.y);
    } else {
      ctx.strokeStyle = c.color;
      ctx.lineWidth = c.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      if (c.t === "path") {
        ctx.moveTo(c.pts[0]!.x, c.pts[0]!.y);
        for (const p of c.pts.length > 1 ? c.pts.slice(1) : c.pts) ctx.lineTo(p.x, p.y); // 점 하나 = 둥근 점
      } else if (c.t === "rect") ctx.rect(c.x, c.y, c.w, c.h);
      else ctx.ellipse(c.cx, c.cy, c.rx, c.ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

const domCanvas = (w: number, h: number): CanvasLike => Object.assign(document.createElement("canvas"), { width: w, height: h }) as unknown as CanvasLike;

export async function composeMarkup(o: { image: unknown; nw: number; nh: number; elements: MarkEl[]; scale?: number; makeCanvas?: (w: number, h: number) => CanvasLike }): Promise<Uint8Array> {
  const c = (o.makeCanvas ?? domCanvas)(o.nw, o.nh);
  c.width = o.nw;
  c.height = o.nh;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas 2d 를 못 얻음");
  ctx.drawImage(o.image, 0, 0);
  paintCommands(ctx, allCommands(o.elements, o.scale ?? 1));
  const blob = await new Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>((res) => c.toBlob(res, "image/png"));
  if (!blob) throw new Error("PNG 로 못 바꿈");
  return new Uint8Array(await blob.arrayBuffer());
}
