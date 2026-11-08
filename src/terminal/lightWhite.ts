// 밝은 모드: CLI 가 직접 RGB 로 보내는 흰색 글자(Claude 기본 dark 테마의 38;2;255;255;255 — 실측)는 테마 팔레트를 안 거쳐 밝은 배경에 묻힌다.
// 밝은 모드일 때만, 채널이 모두 230 이상인 글자색을 밝은 테마 글자색(#1d1b16)으로 바꾼다. 배경색(48;2)·다른 색은 그대로(사용자 선택: 흰색만)
// ponytail: 한 이스케이프가 두 덩어리로 갈리면 그 한 번은 안 바뀜 — 드묾, 생기면 경계 버퍼
const WHITE_FG = /(\x1b\[(?:[0-9;]*;)?)38;2;(2[3-5]\d);(2[3-5]\d);(2[3-5]\d)(?=[;m])/g;
const DARK = "38;2;29;27;22";
// 흰 글자를 진하게 바꾸면 Claude 의 입력 줄 띠(48;2;55;55;55 — 실측)에서 안 보이므로, 아주 어두운 배경(채널 모두 80 이하)은 옅은 회색으로
const DARK_BG = /(\x1b\[(?:[0-9;]*;)?)48;2;([0-7]?\d|80);([0-7]?\d|80);([0-7]?\d|80)(?=[;m])/g;
const SOFT_BG = "48;2;236;232;223";

export function lightenWhite(b: Uint8Array): Uint8Array {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]!); // 바이트 그대로(한글 UTF-8 바이트도 그대로 돌아감)
  if (!s.includes(";2;")) return b;
  const out = s.replace(WHITE_FG, (m, pre: string, r: string, g: string, bl: string) => (+r <= 255 && +g <= 255 && +bl <= 255 ? pre + DARK : m)).replace(DARK_BG, (_m, pre: string) => pre + SOFT_BG);
  if (out === s) return b;
  const o = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) o[i] = out.charCodeAt(i);
  return o;
}

export const isLight = () => typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "light";
