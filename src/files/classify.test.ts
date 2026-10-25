import { describe, expect, it } from "vitest";
import { classify } from "./classify";
import type { FileStat } from "../lib/ipc";

const f = (size = 100): FileStat => ({ exists: true, isDir: false, size, mtime: 0 });
const d: FileStat = { exists: true, isDir: true, size: 0, mtime: 0 };

// S-953 판정 순서: ① 폴더 ② 이미지 확장자 ③ repo 안 .md/.markdown ④ 그 밖의 텍스트 ⑤ 나머지
describe("classify (S-953)", () => {
  it("① 폴더: 읽을 수 있는 텍스트 파일이 있으면 탐색기, 없으면 파일", () => {
    expect(classify(d, "binary", "", true, true)).toBe("explorer");
    expect(classify(d, "binary", "", true, false)).toBe("file");
    expect(classify(d, "binary", "", false, true)).toBe("explorer"); // repo 밖 폴더도 같다
  });
  it("② 이미지 확장자는 이미지 (대소문자 무시, repo 안/밖 같음)", () => {
    for (const e of ["png", "jpg", "jpeg", "gif", "webp", "bmp", "PNG", "JpG"]) expect(classify(f(), "binary", e, true)).toBe("image");
    expect(classify(f(), "binary", "png", false)).toBe("image");
  });
  it("③ repo 안의 .md·.markdown 은 Markdown", () => {
    expect(classify(f(), "text", "md", true)).toBe("markdown");
    expect(classify(f(), "text", "markdown", true)).toBe("markdown");
    expect(classify(f(), "text", "MD", true)).toBe("markdown");
  });
  it("③' repo 밖에 그대로 둔 .md 는 코드 카드(④)", () => {
    expect(classify(f(), "text", "md", false)).toBe("code");
  });
  it("④ 그 밖의 텍스트는 코드", () => {
    expect(classify(f(), "text", "ts", true)).toBe("code");
    expect(classify(f(), "text", "", false)).toBe("code"); // 확장자 없는 글 파일
  });
  it("⑤ 바이너리·800KB 초과·읽기 오류는 파일 카드", () => {
    expect(classify(f(), "binary", "exe", true)).toBe("file");
    expect(classify(f(800 * 1024 + 1), "text", "ts", true)).toBe("file");
    expect(classify(f(), "tooLarge", "ts", true)).toBe("file");
    expect(classify(f(), "error", "ts", true)).toBe("file");
  });
  it("정확히 800KB 는 아직 코드", () => {
    expect(classify(f(800 * 1024), "text", "ts", true)).toBe("code");
  });
  it("없어진 경로는 파일 카드(Missing 을 보인다)", () => {
    expect(classify({ exists: false, isDir: false, size: 0, mtime: 0 }, "error", "ts", true)).toBe("file");
  });
});
