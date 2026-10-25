import { describe, expect, it } from "vitest";
import { decodeCp1252, detectEncoding, encodeCp1252 } from "./encoding";

const u = (...n: number[]) => new Uint8Array(n);
describe("S-1812 encoding", () => {
  it("1252 표: 0x80~0x9F 는 € … “ ” ™ 같은 글자, 나머지는 Latin-1", () => {
    expect(decodeCp1252(u(0x63, 0x61, 0x66, 0xe9))).toBe("café");
    expect(decodeCp1252(u(0x80, 0x85, 0x93, 0x94, 0x99))).toBe("€…“”™");
  });
  it("1252 로 쓰기: 표에 있는 글자는 바이트로, 없으면 null", () => {
    expect([...encodeCp1252("€é")!]).toEqual([0x80, 0xe9]);
    expect(encodeCp1252("한")).toBeNull();
  });
  it("종류를 알아낸다: BOM·UTF-8·1252", () => {
    expect(detectEncoding(u(0xef, 0xbb, 0xbf, 0x68))).toEqual({ encoding: "utf-8", bom: true });
    expect(detectEncoding(u(0xff, 0xfe, 0x68, 0))).toEqual({ encoding: "utf-16le", bom: true });
    expect(detectEncoding(u(0xfe, 0xff, 0, 0x68))).toEqual({ encoding: "utf-16be", bom: true });
    expect(detectEncoding(new TextEncoder().encode("한글"))).toEqual({ encoding: "utf-8", bom: false });
    expect(detectEncoding(u(0x63, 0xe9))).toEqual({ encoding: "windows-1252", bom: false });
  });
  it("S-2473 한글 줄: UTF-8(BOM 있음·없음)은 그대로, CP949 가짜 바이트는 깨지지 않고 1252 로 읽힌다(저장 시 1252 로 못 쓰는 글자는 변환 안내)", () => {
    const body = new TextEncoder().encode("안녕하세요 한글 줄");
    expect(detectEncoding(body)).toEqual({ encoding: "utf-8", bom: false });
    expect(detectEncoding(new Uint8Array([0xef, 0xbb, 0xbf, ...body]))).toEqual({ encoding: "utf-8", bom: true });
    const cp949 = u(0xc7, 0xd1, 0xb1, 0xdb); // "한글" 의 CP949 바이트
    expect(detectEncoding(cp949)).toEqual({ encoding: "windows-1252", bom: false });
    expect(decodeCp1252(cp949)).toHaveLength(4);
    expect(encodeCp1252("한글")).toBeNull();
  });
});
