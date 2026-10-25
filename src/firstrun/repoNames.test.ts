import { describe, expect, it } from "vitest";
import { defaultBase, joinDest, nameError, repoNameFromUrl } from "./repoNames";

describe("S-395 repoNameFromUrl", () => {
  it.each([
    ["https://github.com/foo/bar.git", "bar"],
    ["https://github.com/foo/bar", "bar"],
    ["https://github.com/foo/bar/", "bar"],
    ["git@github.com:foo/bar.git", "bar"],
    ["git@github.com:bar.git", "bar"],
    ["ssh://git@host:22/foo/bar.git", "bar"],
    ["git://host/foo/bar.git", "bar"],
    ["  https://example.com/a/my-repo.git  ", "my-repo"],
  ])("%s -> %s", (url, name) => expect(repoNameFromUrl(url)).toBe(name));
  it.each(["", "   ", "not a url", "https://github.com/", "https://github.com", "git@github.com:"])("이름을 못 뽑으면 null: %j", (url) =>
    expect(repoNameFromUrl(url)).toBeNull(),
  );
});

describe("S-394 위치", () => {
  it("기본은 home 아래 symvibe, hypervibe 가 있으면 그것", () => {
    expect(defaultBase("C:\\Users\\me", false)).toBe("C:\\Users\\me\\symvibe");
    expect(defaultBase("C:\\Users\\me", true)).toBe("C:\\Users\\me\\hypervibe");
    expect(defaultBase("C:\\Users\\me\\", false)).toBe("C:\\Users\\me\\symvibe");
  });
  it("joinDest: 끝 구분자 하나만, 쓰던 구분자 유지", () => {
    expect(joinDest("C:\\Users\\me\\symvibe", "bar")).toBe("C:\\Users\\me\\symvibe\\bar");
    expect(joinDest("C:\\Users\\me\\symvibe\\", "bar")).toBe("C:\\Users\\me\\symvibe\\bar");
    expect(joinDest("C:/work", "bar")).toBe("C:/work/bar");
  });
});

describe("S-394·S-401 nameError", () => {
  it("괜찮은 이름은 null", () => {
    expect(nameError("ok-name_1.2", false)).toBeNull();
  });
  it("비었거나 폴더 이름으로 못 쓰는 글자", () => {
    for (const n of ["", "   ", "a/b", "a\\b", "a:b", "a*b", "a?b", "..", "."]) expect(nameError(n, false), n).not.toBeNull();
  });
  it("같은 이름 폴더가 이미 있으면 거절(덮지 않음)", () => {
    expect(nameError("bar", true)).toMatch(/already exists/i);
  });
});
