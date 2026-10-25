// S-2277 말로 한 구두점: comma → , period → . question mark → ? (앞 낱말에 붙이고 뒤는 원래 공백, 엔진이 붙인 구두점은 흡수)
const MARK: Record<string, string> = { comma: ",", period: ".", "question mark": "?" };
export const applySpokenPunctuation = (text: string): string =>
  text.replace(/\s*\b(comma|period|question\s+mark)\b[,.?!]?/gi, (_, w: string) => MARK[w.toLowerCase().replace(/\s+/g, " ")]!);
