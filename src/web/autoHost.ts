// S-1140~S-1142: 콘솔별 출력 조각을 받아 로컬 서버 주소를 찾고, 응답하면 콘솔 오른쪽에 auto 웹 타일을 놓는다.
// 숨은 워크스페이스도 같다(session 이 출력을 계속 받는다). 콘솔·호스트:포트 한 번만 — 사용자가 지워도 다시 안 만든다.
import type { Scope } from "../board/boards";
import { placeNew } from "../board/kinds/registry";
import { GAP } from "../board/placement";
import { isTauri, webProbe } from "../lib/ipc";
import { RETRY_MS, probeStep, scanUrls, seenKey, type Found } from "./autoPreview";

type St = { carry: string; dec: TextDecoder; timer?: ReturnType<typeof setTimeout> };
const seen = new Set<string>();
const states = new Map<string, St>();
const retryMs = () => (!isTauri() && (window as unknown as { __autoRetryMs?: number }).__autoRetryMs) || RETRY_MS; // 시험이 간격을 줄인다

function scan(scope: Scope, nodeId: string, cid: string, st: St, text: string) {
  clearTimeout(st.timer);
  const r = scanUrls(text, st.carry, seen, cid);
  st.carry = r.carry;
  for (const f of r.found) void watch(scope, nodeId, cid, f);
  // 끝까지 닿은 주소는 다음 조각을 기다리되, 조용해지면(0.3초) 줄바꿈이 온 것으로 친다
  if (st.carry.includes("http")) st.timer = setTimeout(() => scan(scope, nodeId, cid, st, "\n"), 300);
}

/** session.ts 가 PTY 출력 조각마다 부른다 */
export function feed(scope: Scope, nodeId: string, bytes: Uint8Array): void {
  const cid = `${scope.wsId}/${nodeId}`;
  let st = states.get(cid);
  if (!st) states.set(cid, (st = { carry: "", dec: new TextDecoder() }));
  scan(scope, nodeId, cid, st, st.dec.decode(bytes, { stream: true }));
}

async function watch(scope: Scope, nodeId: string, cid: string, f: Found): Promise<void> {
  for (let tries = 1; ; tries++) {
    if (!scope.store.getState().nodes[nodeId]) return void seen.delete(seenKey(cid, f.key)); // 콘솔이 지워졌다
    const r = await webProbe(f.url).catch(() => null);
    const step = probeStep(tries, !!r?.reachable);
    if (step === "place") return place(scope, nodeId, f);
    if (step === "giveup") return void seen.delete(seenKey(cid, f.key)); // 나중에 다시 찍히면 다시 시도
    await new Promise((res) => setTimeout(res, retryMs()));
  }
}

function place(scope: Scope, nodeId: string, f: Found): void {
  const s = scope.store.getState();
  const c = s.nodes[nodeId];
  if (!c) return;
  const prev = s.selection;
  placeNew(scope.store, "web", { auto: true, url: f.url, wireTo: nodeId }, { x: c.x + c.w + GAP, y: c.y }); // 되돌리기 1단계(S-1142)
  scope.store.getState().select(prev); // 사용자가 보던 선택은 그대로
}
