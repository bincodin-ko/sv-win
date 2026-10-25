import { describe, expect, it } from "vitest";
import { MAX_TRIES, RETRY_MS, probeStep, scanUrls } from "./autoPreview";

// S-1140: 콘솔 출력에서 로컬 서버 주소 찾기. 허용 호스트 4종, ANSI 제거, 조각 경계, 0.0.0.0→localhost, 콘솔·호스트:포트당 한 번
const scan = (chunk: string, carry = "", seen = new Set<string>(), cid = "c1") => ({ ...scanUrls(chunk, carry, seen, cid), seen });
const urls = (r: { found: { url: string }[] }) => r.found.map((f) => f.url);

describe("scanUrls", () => {
  it("ANSI 색 코드가 섞인 줄에서 주소를 찾는다", () => {
    const r = scan("\x1b[32m  ➜  Local:   \x1b[36mhttp://localhost:\x1b[1m5173\x1b[22m/\x1b[0m\r\n");
    expect(urls(r)).toEqual(["http://localhost:5173/"]);
    expect(r.found[0]!.key).toBe("localhost:5173");
  });
  it("조각 경계에서 끊긴 주소를 잇는다 (http://local | host:3000/)", () => {
    const a = scan("ready on http://local");
    expect(urls(a)).toEqual([]);
    const b = scan("host:3000/", a.carry, a.seen);
    expect(urls(b)).toEqual([]); // 아직 끝났는지 모른다(3000/ 뒤에 더 올 수 있다)
    const c = scan("\r\n", b.carry, b.seen);
    expect(urls(c)).toEqual(["http://localhost:3000/"]);
  });
  it("글자 색 제어 코드가 조각 사이에서 끊겨도 주소가 깨지지 않는다", () => {
    const a = scan("go http://localhost:3000/\x1b[3");
    const b = scan("2m\r\n", a.carry, a.seen);
    expect(urls(a).concat(urls(b))).toEqual(["http://localhost:3000/"]);
  });
  it("https, 127.0.0.1, [::1], 경로와 질문표", () => {
    expect(urls(scan("https://localhost:8443/a/b?x=1 \n"))).toEqual(["https://localhost:8443/a/b?x=1"]);
    expect(urls(scan("http://127.0.0.1:8080/ \n"))).toEqual(["http://127.0.0.1:8080/"]);
    expect(urls(scan("http://[::1]:4000/ \n"))).toEqual(["http://[::1]:4000/"]);
  });
  it("포트가 없으면 스킴 기본 포트로 키를 만든다", () => {
    expect(scan("http://localhost \n").found[0]!.key).toBe("localhost:80");
    expect(scan("https://localhost/ \n").found[0]!.key).toBe("localhost:443");
  });
  it("0.0.0.0 은 localhost 로 바꿔 연다", () => {
    const r = scan("Serving on http://0.0.0.0:8000/ \n");
    expect(urls(r)).toEqual(["http://localhost:8000/"]);
    expect(r.found[0]!.key).toBe("localhost:8000");
  });
  it("외부 주소와 localhost 로 시작하는 다른 호스트는 무시", () => {
    expect(urls(scan("see https://example.com/docs and http://localhost.evil.com:3000/ and http://192.168.0.5:3000/ \n"))).toEqual([]);
  });
  it("문장 끝 마침표·괄호는 주소에 넣지 않는다", () => {
    expect(urls(scan("open (http://localhost:3000/app). \n"))).toEqual(["http://localhost:3000/app"]);
    expect(urls(scan("open http://localhost:3000. \n"))).toEqual(["http://localhost:3000"]);
  });
  it("같은 콘솔·같은 호스트:포트는 한 번만, 다른 포트·다른 콘솔은 따로", () => {
    const seen = new Set<string>();
    expect(urls(scan("http://localhost:3000/ \n", "", seen))).toEqual(["http://localhost:3000/"]);
    expect(urls(scan("http://localhost:3000/other \n", "", seen))).toEqual([]);
    expect(urls(scan("http://localhost:3001/ \n", "", seen))).toEqual(["http://localhost:3001/"]);
    expect(urls(scan("http://localhost:3000/ \n", "", seen, "c2"))).toEqual(["http://localhost:3000/"]);
  });
  it("한 조각에 주소가 둘이면 둘 다", () => {
    expect(urls(scan("a http://localhost:3000/ b http://localhost:4000/ \n"))).toEqual(["http://localhost:3000/", "http://localhost:4000/"]);
  });
  it("주소가 없는 조각은 아무것도 안 내고 carry 가 커지지 않는다", () => {
    const r = scan("x".repeat(5000));
    expect(r.found).toEqual([]);
    expect(r.carry.length).toBeLessThanOrEqual(300);
  });
});

describe("probeStep (3초 간격 최대 10번)", () => {
  it("상수", () => {
    expect(RETRY_MS).toBe(3000);
    expect(MAX_TRIES).toBe(10);
  });
  it("응답하면 그 자리에서 놓는다", () => {
    expect(probeStep(1, true)).toBe("place");
    expect(probeStep(10, true)).toBe("place");
  });
  it("안 되면 9번째까지 다시, 10번째에서 포기", () => {
    expect(probeStep(1, false)).toBe("retry");
    expect(probeStep(9, false)).toBe("retry");
    expect(probeStep(10, false)).toBe("giveup");
  });
});
