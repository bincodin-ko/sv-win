// S-1104: 탭별 Back/Forward 기록(앱이 연 주소만). "" = 시작 탭(다이얼).
export type Hist = { list: string[]; i: number };
export const newHist = (url = ""): Hist => ({ list: [url], i: 0 });
export const curHist = (h: Hist): string => h.list[h.i]!;
export const pushHist = (h: Hist, url: string): Hist => (url === curHist(h) ? h : { list: [...h.list.slice(0, h.i + 1), url], i: h.i + 1 });
export const backHist = (h: Hist): Hist => (h.i > 0 ? { ...h, i: h.i - 1 } : h);
export const forwardHist = (h: Hist): Hist => (h.i < h.list.length - 1 ? { ...h, i: h.i + 1 } : h);
export const canBack = (h: Hist): boolean => h.i > 0;
export const canForward = (h: Hist): boolean => h.i < h.list.length - 1;
