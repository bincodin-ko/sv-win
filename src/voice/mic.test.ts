import { afterEach, describe, expect, it, vi } from "vitest";
import { listInputs, micState, requestMic } from "./mic";

const dev = (kind: string, label: string, deviceId = label) => ({ kind, label, deviceId }) as MediaDeviceInfo;
const setMedia = (m: Partial<MediaDevices> | undefined, perm?: unknown) => vi.stubGlobal("navigator", { mediaDevices: m, permissions: perm });
afterEach(() => vi.unstubAllGlobals());

describe("S-2230 listInputs", () => {
  it("audioinput 만, 이름이 비면 Microphone N", async () => {
    setMedia({ enumerateDevices: async () => [dev("audioinput", "USB Mic", "a"), dev("videoinput", "Cam", "v"), dev("audioinput", "", "b"), dev("audiooutput", "Spk", "s")] });
    expect(await listInputs()).toEqual([{ id: "a", label: "USB Mic" }, { id: "b", label: "Microphone 2" }]);
  });
  it("mediaDevices 가 없으면 빈 목록", async () => {
    setMedia(undefined);
    expect(await listInputs()).toEqual([]);
  });
});

describe("S-2230 requestMic", () => {
  it("허용: granted 이고 잡은 스트림은 곧 닫는다", async () => {
    const stop = vi.fn();
    setMedia({ getUserMedia: async () => ({ getTracks: () => [{ stop }, { stop }] }) as unknown as MediaStream });
    expect(await requestMic()).toBe("granted");
    expect(stop).toHaveBeenCalledTimes(2);
  });
  it("차단: denied", async () => {
    setMedia({ getUserMedia: async () => { throw Object.assign(new Error("x"), { name: "NotAllowedError" }); } });
    expect(await requestMic()).toBe("denied");
  });
  it("장치 없음: none", async () => {
    setMedia({ getUserMedia: async () => { throw Object.assign(new Error("x"), { name: "NotFoundError" }); } });
    expect(await requestMic()).toBe("none");
  });
});

describe("S-2230 micState", () => {
  it("Permissions API 결과", async () => {
    setMedia({}, { query: async () => ({ state: "granted" }) });
    expect(await micState()).toBe("granted");
    setMedia({}, { query: async () => ({ state: "denied" }) });
    expect(await micState()).toBe("denied");
  });
  it("안 되면 unknown", async () => {
    setMedia({}, { query: async () => { throw new Error("no"); } });
    expect(await micState()).toBe("unknown");
    setMedia({}, undefined);
    expect(await micState()).toBe("unknown");
  });
});
