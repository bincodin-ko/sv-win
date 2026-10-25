// S-1103: 주소 입력 보정. http·https 만 연다.
import { tm } from "../i18n";
export type UrlResult = { ok: true; url: string } | { ok: false; error: string };
export const URL_ERROR = tm("Only http and https pages load."); // 화면에서 t(error)
const bad: UrlResult = { ok: false, error: URL_ERROR };
const HOST = /^(\[[^\]]*\]|[^/:?#]*)(:\d+)?(?=[/?#]|$)/;

export function normalizeUrl(input: string): UrlResult {
  const s = input.trim();
  if (!s || /\s/.test(s)) return bad;
  let u = s;
  if (!/^https?:\/\//i.test(s)) {
    const m = HOST.exec(s);
    // "localhost:3000" 은 스킴이 아니라 host:port 다. 그 밖의 "xxx:" 는 http 아닌 스킴이라 거절
    if (!m || (/^[a-z][a-z0-9+.-]*:/i.test(s) && !m[2])) return bad;
    const host = m[1]!;
    const local = host === "localhost" || host.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(host);
    if (local || m[2]) u = `http://${s}`;
    else if (host.includes(".")) u = `https://${s}`;
    else return bad;
  }
  try { new URL(u); } catch { return bad; }
  return { ok: true, url: u };
}
