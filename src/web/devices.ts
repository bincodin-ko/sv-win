// S-1108: 기기 크기 표와 Fit tile 축소 계산.
export type Device = { id: string; label: string; w: number; h: number; group: "DISPLAYS" | "PHONES" };
const d = (id: string, label: string, w: number, h: number, group: Device["group"]): Device => ({ id, label, w, h, group });
export const DEVICES: Device[] = [
  d("monitor-24", "24 in monitor", 1920, 1080, "DISPLAYS"),
  d("monitor-27", "27 in monitor", 2560, 1440, "DISPLAYS"),
  d("monitor-32-4k", "32 in 4K", 3840, 2160, "DISPLAYS"),
  d("iphone-se", "iPhone SE", 375, 667, "PHONES"),
  d("iphone-14-pro", "iPhone 14 Pro", 393, 852, "PHONES"),
  d("iphone-14-pro-max", "iPhone 14 Pro Max", 430, 932, "PHONES"),
  d("pixel-7", "Pixel 7", 412, 915, "PHONES"),
  d("galaxy-s8-plus", "Galaxy S8+", 360, 740, "PHONES"),
];
/** 기기 크기 d 를 영역 avail 안에 비율을 지켜 가운데로(키우지는 않는다) */
export function fitDevice(d: { w: number; h: number }, avail: { w: number; h: number }): { scale: number; left: number; top: number } {
  const scale = Math.min(1, avail.w / d.w, avail.h / d.h);
  return { scale, left: (avail.w - d.w * scale) / 2, top: (avail.h - d.h * scale) / 2 };
}
