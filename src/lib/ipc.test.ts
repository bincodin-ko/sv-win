import { describe, expect, it } from "vitest";
import { fakePty, ptyKill, ptySpawn, ptyWrite } from "./ipc";

const dec = new TextDecoder();

function spawnCollect() {
  const chunks: Uint8Array[] = [];
  const exits: (number | null)[] = [];
  const p = ptySpawn({ cols: 80, rows: 24, onData: (b) => chunks.push(b), onExit: (c) => exits.push(c) });
  return { p, chunks, exits, text: () => chunks.map((c) => dec.decode(c)).join("") };
}

describe("가짜 PTY (Tauri 밖)", () => {
  it("쓴 글자를 되울린다(Enter는 줄바꿈)", async () => {
    const t = spawnCollect();
    const id = await t.p;
    await ptyWrite(id, "abc\r");
    expect(t.text()).toBe("abc\r\n");
  });

  it("flood는 요청한 바이트 이상을 64KB 이하 묶음으로 보내고 DONE-<id>로 끝낸다", async () => {
    const t = spawnCollect();
    const id = await t.p;
    await fakePty.flood(id, 300_000);
    const total = t.chunks.reduce((n, c) => n + c.length, 0);
    expect(total).toBeGreaterThanOrEqual(300_000);
    expect(Math.max(...t.chunks.map((c) => c.length))).toBeLessThanOrEqual(64 * 1024);
    expect(t.text().endsWith(`DONE-${id}\r\n`)).toBe(true);
  });

  it("kill하면 onExit가 한 번 오고 이후 쓰기는 무시된다", async () => {
    const t = spawnCollect();
    const id = await t.p;
    await ptyKill(id);
    await ptyKill(id);
    await ptyWrite(id, "x");
    expect(t.exits).toEqual([null]);
    expect(t.text()).toBe("");
  });

  it("id는 터미널마다 다르다", async () => {
    const a = await spawnCollect().p;
    const b = await spawnCollect().p;
    expect(a).not.toBe(b);
    expect(fakePty.ids()).toEqual(expect.arrayContaining([a, b]));
  });
});
