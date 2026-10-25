import { afterEach, describe, expect, it, vi } from "vitest";
import { checkUpdate, newerThan, UPDATE_REPO } from "./check";

// S-3120 표 (spec/12묶음.md)
describe("S-3120 newerThan", () => {
  it.each([
    ["v0.1.1", "0.1.0", true],
    ["0.2", "0.1.9", true],
    ["V1.0.0", "0.9.9", true],
    ["v0.1.0", "0.1.0", false],
    ["v0.0.9", "0.1.0", false],
    ["v1.0.0-rc1", "0.1.0", false],
    ["abc", "0.1.0", false],
    ["", "0.1.0", false],
  ])("%s vs %s -> %s", (tag, cur, want) => expect(newerThan(tag, cur)).toBe(want));
});

const asset = (extra = {}) => ({ name: "Symvibe_0.1.1_x64-setup.exe", browser_download_url: "https://github.com/x/y/releases/download/v0.1.1/Symvibe_0.1.1_x64-setup.exe", ...extra });
const rel = (assets: unknown[]) => ({ tag_name: "v0.1.1", html_url: "https://github.com/bincodin-ko/sv-win/releases/tag/v0.1.1", assets });
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("S-3121 checkUpdate (가짜 fetch, 실제 GitHub 호출 없음)", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("200: 자산·digest 있음", async () => {
    const f = reply(200, rel([{ name: "Symvibe-guide-ko.html", browser_download_url: "https://x/g.html" }, asset({ digest: "sha256:abc123" })]));
    vi.stubGlobal("fetch", f);
    expect(await checkUpdate()).toEqual({ tag: "v0.1.1", url: rel([]).html_url, asset: { name: asset().name, url: asset().browser_download_url, sha256: "abc123" } });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`);
    expect((init.headers as Record<string, string>).Accept).toBe("application/vnd.github+json");
    expect(init.credentials).toBe("omit");
  });
  it("200: digest 없음 -> sha256 없음, setup.exe 자산 없음 -> asset 없음", async () => {
    vi.stubGlobal("fetch", reply(200, rel([asset()])));
    const r = (await checkUpdate()) as { asset: { name: string; sha256?: string } };
    expect(r.asset.name).toBe(asset().name);
    expect(r.asset.sha256).toBeUndefined();
    vi.stubGlobal("fetch", reply(200, rel([{ name: "a.zip", browser_download_url: "https://x/a.zip" }])));
    expect(((await checkUpdate()) as { asset?: unknown }).asset).toBeUndefined();
  });
  it("404 -> none", async () => {
    vi.stubGlobal("fetch", reply(404, { message: "Not Found" }));
    expect(await checkUpdate()).toBe("none");
  });
  it("네트워크 오류·500·깨진 본문 -> failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("net"); }));
    expect(await checkUpdate()).toBe("failed");
    vi.stubGlobal("fetch", reply(500, {}));
    expect(await checkUpdate()).toBe("failed");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json", { status: 200 })));
    expect(await checkUpdate()).toBe("failed");
  });
  it("8초 시간 초과 -> failed", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const p = checkUpdate();
    let done = false;
    void p.then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(7999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(await p).toBe("failed");
  });
});
