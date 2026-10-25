// S-2208 게이트, S-2209 무음 환각 필터 (순수)
export const GATE_MS = 300;
export const GATE_RMS = 0.01;

/** 300ms 이상이고 최대 RMS 가 문턱 이상일 때만 엔진을 부른다 */
export const passesGate = (s: { ms: number; peakRms: number }) => s.ms >= GATE_MS && s.peakRms >= GATE_RMS;

const PHRASES = new Set(["thank you", "thanks for watching", "thanks for listening", "you", "bye", "okay", "blank audio", "silence", "music",
  // S-2454: Whisper small 의 한국어 무음 환각(띄어쓰기 제거 형태로 비교)
  "시청해주셔서감사합니다", "구독과좋아요부탁드립니다", "감사합니다"]);

/** 글 전체가 엔진이 무음에서 지어내는 말 하나일 때만 빈 글. 문장 속은 그대로 */
export function filterHallucination(text: string): string {
  const t = text.trim().toLowerCase();
  const core = t.replace(/[\s\p{P}♪]+/gu, " ").trim(); // 구두점·괄호·♪ 무시
  if (!core) return ""; // "…", "♪", "[ ]" 만
  if (PHRASES.has(core) || PHRASES.has(core.replace(/ /g, ""))) return "";
  if (/^(자막 ?제공|한글 ?자막|mbc 뉴스)/.test(core)) return "";
  if (/^subtitles by\b/.test(core)) return "";
  const words = core.split(" ");
  if (words.length >= 6 && words.every((w) => w === words[0])) return "";
  return text;
}
