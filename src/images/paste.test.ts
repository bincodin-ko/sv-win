import { describe, expect, it } from "vitest";
import { pasteFileName, pickImageFile } from "./paste";

// S-883: paste 이벤트에 이미지가 있으면 그것을, 없으면 null(기존 노드 붙여넣기로)
const f = (type: string, name = "x") => ({ type, name });
describe("pickImageFile", () => {
  it("이미지 파일 하나", () => { const a = f("image/png"); expect(pickImageFile({ files: [a] })).toBe(a); });
  it("이미지가 없으면 null (글 파일만)", () => expect(pickImageFile({ files: [f("text/plain")] })).toBeNull());
  it("clipboardData 가 없거나 비었으면 null", () => {
    expect(pickImageFile(null)).toBeNull();
    expect(pickImageFile(undefined)).toBeNull();
    expect(pickImageFile({ files: [] })).toBeNull();
    expect(pickImageFile({})).toBeNull();
  });
  it("여러 개면 첫 이미지", () => {
    const a = f("text/plain"), b = f("image/jpeg", "b"), c = f("image/png", "c");
    expect(pickImageFile({ files: [a, b, c] })).toBe(b);
  });
  it("files 가 비고 items 에만 있어도(화면 캡처) 찾는다", () => {
    const img = f("image/png");
    expect(pickImageFile({ files: [], items: [{ kind: "string", type: "text/plain", getAsFile: () => null }, { kind: "file", type: "image/png", getAsFile: () => img }] })).toBe(img);
  });
  it("items 의 글은 이미지가 아니다", () => expect(pickImageFile({ items: [{ kind: "string", type: "text/plain", getAsFile: () => null }] })).toBeNull());
});

describe("pasteFileName", () => {
  const t = new Date(2026, 9, 24, 15, 30, 45);
  it("png", () => expect(pasteFileName("image/png", t)).toBe("shot-20261024-153045.png"));
  it("jpeg 는 jpg", () => expect(pasteFileName("image/jpeg", t)).toBe("shot-20261024-153045.jpg"));
  it("gif·webp·bmp", () => {
    expect(pasteFileName("image/gif", t)).toMatch(/\.gif$/);
    expect(pasteFileName("image/webp", t)).toMatch(/\.webp$/);
    expect(pasteFileName("image/bmp", t)).toMatch(/\.bmp$/);
  });
  it("모르는 종류는 png", () => expect(pasteFileName("image/x-weird", t)).toMatch(/\.png$/));
  it("한 자리 월·일·시는 0 으로 채운다", () => expect(pasteFileName("image/png", new Date(2026, 0, 2, 3, 4, 5))).toBe("shot-20260102-030405.png"));
});
