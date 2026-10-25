import { describe, expect, it } from "vitest";
import { normalizeUrl, URL_ERROR } from "./url";

// S-1103: 스킴이 없으면 localhost·IP·:포트 는 http://, 점이 있으면 https://. http/https 밖과 점 없는 한 단어는 거절.
const ok = (s: string) => { const r = normalizeUrl(s); return r.ok ? r.url : r; };
describe("normalizeUrl (S-1103)", () => {
  it("localhost·IP·포트는 http://", () => {
    expect(ok("localhost:3000")).toBe("http://localhost:3000");
    expect(ok("localhost")).toBe("http://localhost");
    expect(ok("127.0.0.1:8080/x")).toBe("http://127.0.0.1:8080/x");
    expect(ok("192.168.0.5")).toBe("http://192.168.0.5");
    expect(ok("[::1]:3000")).toBe("http://[::1]:3000");
  });
  it("점이 있으면 https://", () => {
    expect(ok("example.com")).toBe("https://example.com");
    expect(ok("news.ycombinator.com/item?id=1")).toBe("https://news.ycombinator.com/item?id=1");
  });
  it("http·https 는 그대로, 앞뒤 공백은 뗀다", () => {
    expect(ok("  https://a.com/x  ")).toBe("https://a.com/x");
    expect(ok("http://b.org")).toBe("http://b.org");
    expect(ok("HTTP://b.org")).toBe("HTTP://b.org");
  });
  it("점 없는 한 단어·빈 글·http 밖 스킴은 거절 + 문구", () => {
    for (const s of ["hello", "", "   ", "file:///c:/a.txt", "javascript:alert(1)", "data:text/html,hi", "ftp://a.com", "about:blank", "a b.com"]) {
      expect(normalizeUrl(s), s).toEqual({ ok: false, error: URL_ERROR });
    }
    expect(URL_ERROR).toBe("Only http and https pages load.");
  });
});
