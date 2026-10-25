import { expect, it } from "vitest";
import { Recorder } from "./capture";

// S-2262: 멈추지 않고 지금까지의 소리를 16kHz PCM16 으로 준다
it("snapshot 은 지금까지 모은 소리를 주고 듣기를 멈추지 않는다", () => {
  const r = new Recorder(16000);
  r.push(new Float32Array(1600).fill(0.5));
  expect(r.snapshot().length).toBe(3200); // 1600 표본 x 2바이트
  r.push(new Float32Array(1600).fill(0.5));
  expect(r.snapshot().length).toBe(6400); // 계속 모인다
  expect(r.finish().pcm.length).toBe(6400);
});
