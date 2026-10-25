import { describe, expect, it } from "vitest";
import { parseOpen } from "./webCmd";

// S-1066
describe("parseOpen", () => {
  it.each([
    ["localhost 3000", "http://localhost:3000"],
    ["localhost:3000", "http://localhost:3000"],
    ["localhost:3000/app", "http://localhost:3000/app"],
    ["localhost 3000/app?x=1", "http://localhost:3000/app?x=1"],
    ["127.0.0.1:5173", "http://127.0.0.1:5173"],
    ["3000", "http://localhost:3000"],
    ["http://example.com/a", "http://example.com/a"],
    ["https://example.com", "https://example.com"],
    ["HTTPS://Example.com/X", "HTTPS://Example.com/X"],
  ])("%j -> %s", (t, url) => expect(parseOpen(t)).toEqual({ url }));
  it.each(["ftp://x", "file:///c:/x", "javascript:alert(1)", "data:text/html,hi", "chrome://settings"])("%j 는 거절", (t) => {
    expect(parseOpen(t)).toEqual({ error: "I can only open http and https pages." });
  });
  it.each(["settings", "the door", "", "Otto"])("%j 는 웹 주소가 아니다(null)", (t) => expect(parseOpen(t)).toBeNull());
});
