import { beforeEach, describe, expect, it, vi } from "vitest";

// 기대값 출처: 설명서 FX6 D5 (S-317·S-322): 홈에서 Ctrl+O = 홈의 폴더 추가(보드를 열지 않음), 보드에서는 pickFolder -> openRepo
const pick = vi.hoisted(() => vi.fn(async () => null as string | null));
vi.mock("../lib/ipc", async (orig) => ({ ...(await orig<typeof import("../lib/ipc")>()), pickFolder: pick }));
import { useShell } from "./useShell";
import { homeHooks, runAppKey } from "./workspaces";

beforeEach(() => { pick.mockClear(); homeHooks.addFolder = null; });

describe("runAppKey openFolder D5", () => {
  it("홈이면 홈의 폴더 추가를 부르고 선택창(openRepo 경로)은 부르지 않는다", async () => {
    const add = vi.fn(async () => {});
    homeHooks.addFolder = add;
    useShell.setState({ view: "home" });
    await runAppKey("openFolder");
    expect(add).toHaveBeenCalledTimes(1);
    expect(pick).not.toHaveBeenCalled();
  });
  it("보드면 지금처럼 폴더 선택창(openRepo 경로)", async () => {
    const add = vi.fn(async () => {});
    homeHooks.addFolder = add;
    useShell.setState({ view: "board" });
    await runAppKey("openFolder");
    expect(pick).toHaveBeenCalledTimes(1);
    expect(add).not.toHaveBeenCalled();
  });
});
