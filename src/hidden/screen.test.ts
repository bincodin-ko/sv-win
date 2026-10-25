import { describe, expect, it } from "vitest";
import { createScreen } from "./screen";

describe("S-1201 화면 밖 xterm", () => {
  it("색 바이트는 글자만 남긴다", async () => {
    const s = createScreen();
    s.write("\x1b[31mred\x1b[0m \x1b[1;32mgreen\x1b[0m\r\n");
    expect(await s.text()).toBe("red green");
    s.dispose();
  });
  it("커서 이동 바이트를 따라 글자가 덮인다", async () => {
    const s = createScreen();
    s.write("abc\r\n\x1b[1A\x1b[2Cxy");
    expect(await s.text()).toBe("abxy");
    s.dispose();
  });
  it("줄 끝 공백과 끝의 빈 줄을 지운다", async () => {
    const s = createScreen();
    s.write("hi   \r\nthere  \r\n");
    expect(await s.text()).toBe("hi\nthere");
    s.dispose();
  });
  it("가로 200칸: 150자 줄은 한 줄, 한글(Uint8Array)도 읽힌다", async () => {
    const s = createScreen();
    s.write("x".repeat(150) + "\r\n");
    s.write(new TextEncoder().encode("안녕 세계\r\n"));
    expect(await s.text()).toBe("x".repeat(150) + "\n안녕 세계");
    s.dispose();
  });
  it("세로 50줄을 넘어간 줄도 스크롤백에서 돌려준다", async () => {
    const s = createScreen();
    for (let i = 0; i < 120; i++) s.write(`line ${i}\r\n`);
    const lines = (await s.text()).split("\n");
    expect(lines.length).toBe(120);
    expect(lines[0]).toBe("line 0");
    expect(lines[119]).toBe("line 119");
    s.dispose();
  });
  it("스크롤백은 5,000줄까지(화면 50줄 포함)", async () => {
    const s = createScreen();
    let big = "";
    for (let i = 0; i < 5100; i++) big += `line ${i}\r\n`;
    s.write(big);
    const lines = (await s.text()).split("\n");
    expect(lines.length).toBeLessThanOrEqual(5050);
    expect(lines.length).toBeGreaterThan(5000);
    expect(lines[0]).not.toBe("line 0");
    expect(lines[lines.length - 1]).toBe("line 5099");
    s.dispose();
  });
});
