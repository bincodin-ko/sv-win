// S-1140: 콘솔 출력에서 로컬 서버 주소를 찾는 순수 함수와 재시도 규칙. 상태(세션)는 autoHost.ts.
export type Found = { url: string; key: string };
export const RETRY_MS = 3000; // 추측(S-1140)
export const MAX_TRIES = 10; // 추측(S-1140)
export const seenKey = (cid: string, key: string): string => `${cid}|${key}`;

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;
// 허용 호스트 4종(S-1140). 호스트 뒤가 글자·점+글자면 다른 호스트(localhost.evil.com)라 버린다
const URL_RE = /(https?):\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?![\w-]|\.\w)(?::(\d{1,5}))?([/?#][^\s"'<>`\x1b]*)?/g;
const CARRY_MAX = 300;

/** chunk(+이전 조각 carry)에서 새 주소를 찾는다. seen 에 없는 (콘솔 id, 호스트:포트)만 돌려주고 seen 에 넣는다.
 *  carry = 마지막 공백 뒤 토큰(주소는 공백이 없으니 끊긴 주소·끊긴 색 코드가 여기 남는다). 끝까지 닿은 주소는 더 이어질 수 있어 다음 조각까지 미룬다 */
export function scanUrls(chunk: string, carry: string, seen: Set<string>, cid: string): { found: Found[]; carry: string } {
  const raw = carry + chunk;
  const next = /\S*$/.exec(raw)![0].slice(-CARRY_MAX);
  if (!raw.includes("http")) return { found: [], carry: next };
  const text = raw.replace(ANSI, "");
  const found: Found[] = [];
  for (const m of text.matchAll(URL_RE)) {
    if (m.index + m[0].length === text.length) continue; // 끝까지 닿음: 아직 끝났는지 모른다
    const host = m[2] === "0.0.0.0" ? "localhost" : m[2]!;
    const key = `${host}:${m[3] ?? (m[1] === "https" ? "443" : "80")}`;
    const k = seenKey(cid, key);
    if (seen.has(k)) continue;
    seen.add(k);
    const path = (m[4] ?? "").replace(/[.,;:)\]}'"!?]+$/, "");
    found.push({ url: `${m[1]}://${host}${m[3] ? `:${m[3]}` : ""}${path}`, key });
  }
  return { found, carry: next };
}

/** probe 한 번 뒤의 다음 행동. tries = 지금까지 해 본 횟수(이번 것 포함) */
export function probeStep(tries: number, reachable: boolean): "place" | "retry" | "giveup" {
  return reachable ? "place" : tries >= MAX_TRIES ? "giveup" : "retry";
}
