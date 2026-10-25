// B14 이름으로 preset 을 보드에 놓는 일: 홈 Dispatch 가 쓴다
import { agentsList, defaultAgent } from "../agents/api";
import { getStore, type BoardStore } from "../board/boards";
import { loadWorkspace, openRepo, useShell } from "../shell/useShell";
import { useArmedPreset } from "./armed";
import { PRESETS } from "./defs";
import { deployPreset, registryOpts, stampSaved, viewCenter } from "./deploy";
import { useSaved } from "./useSaved";

/** 지금 보고 있는 워크스페이스의 보드 저장소. 홈이면 null */
export function activeStore(): BoardStore | null {
  const s = useShell.getState();
  const ws = s.view === "board" ? s.openRepos.find((r) => r.path === s.activeRepo)?.activeWs : null;
  return ws ? getStore(ws) : null;
}

/** 내장 preset 이름이나 저장한 layout 이름 하나를 store 의 화면 가운데에 놓는다. 못 찾으면 false */
export async function deployNamed(name: string, store: BoardStore): Promise<boolean> {
  const def = PRESETS.find((p) => p.name === name);
  if (def) {
    const [agents, dflt] = await Promise.all([agentsList(), defaultAgent()]);
    deployPreset(store, def, { center: viewCenter(store), defaultAgent: dflt, installed: agents.map((a) => a.id), ...registryOpts(def) });
    return true;
  }
  await useSaved.getState().load();
  const l = useSaved.getState().list.find((x) => x.name === name);
  if (l) stampSaved(store, l, viewCenter(store));
  return !!l;
}

/** S-649: repo 를 열고(이미 열려 있으면 그대로) 무장된 preset 을 놓은 뒤 무장을 푼다 */
export async function dispatchArmed(path: string): Promise<void> {
  if (!(await openRepo(path))) return;
  const r = useShell.getState().openRepos.find((x) => x.path === path);
  const ws = r?.workspaces.find((w) => w.id === r.activeWs);
  if (!ws) return;
  await loadWorkspace({ id: ws.id, name: ws.name, repoPath: path });
  const name = useArmedPreset.getState().take();
  if (name) await deployNamed(name, getStore(ws.id));
}
