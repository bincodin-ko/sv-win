// 5묶음 E1 S-1812: 글자 인코딩 도우미 (Rust studio.rs 와 같은 규칙)
export type Enc = "utf-8" | "utf-16le" | "utf-16be" | "windows-1252";

// 0x80~0x9F 만 Latin-1 과 다르다. 비어 있는 5칸(81 8D 8F 90 9D)은 같은 번호의 제어 문자
const HI = Array.from("€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ");
export const decodeCp1252 = (b: Uint8Array): string => Array.from(b, (x) => (x >= 0x80 && x < 0xa0 ? HI[x - 0x80]! : String.fromCharCode(x))).join("");
/** 표에 없는 글자가 있으면 null */
export function encodeCp1252(s: string): Uint8Array | null {
  const out: number[] = [];
  for (const c of s) {
    const u = c.codePointAt(0)!;
    const i = u < 0x80 || (u >= 0xa0 && u <= 0xff) ? u : HI.indexOf(c) >= 0 ? 0x80 + HI.indexOf(c) : -1;
    if (i < 0) return null;
    out.push(i);
  }
  return Uint8Array.from(out);
}

export function detectEncoding(b: Uint8Array): { encoding: Enc; bom: boolean } {
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return { encoding: "utf-8", bom: true };
  if (b[0] === 0xff && b[1] === 0xfe) return { encoding: "utf-16le", bom: true };
  if (b[0] === 0xfe && b[1] === 0xff) return { encoding: "utf-16be", bom: true };
  try { new TextDecoder("utf-8", { fatal: true }).decode(b); return { encoding: "utf-8", bom: false }; } catch { return { encoding: "windows-1252", bom: false }; }
}
