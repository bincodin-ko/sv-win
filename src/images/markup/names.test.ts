import { expect, it } from "vitest";
import { markupName } from "./names";

// S-888: <원본 이름>-markup-<n>.png
it("원본 이름 뒤에 -markup-1.png", () => expect(markupName("C:/fake/pics/wide.png")).toBe("wide-markup-1.png"));
it("역슬래시 경로·다른 확장자도 png 로", () => expect(markupName("C:\\p\\photo.JPG")).toBe("photo-markup-1.png"));
it("이미 markup 한 그림이면 번호를 올린다", () => expect(markupName("C:/x/wide-markup-1.png")).toBe("wide-markup-2.png"));
it("확장자가 없어도", () => expect(markupName("C:/x/a")).toBe("a-markup-1.png"));
