// D5 S-1413 알림: 창이 뒤에 있을 때만, 소리 없이. 이 앱의 알림은 loop 의 두 경우뿐
const N = () => (window as unknown as { Notification?: typeof Notification }).Notification;

export const windowBehind = (): boolean => document.hidden || !document.hasFocus();

let asked = false;
/** loop 를 처음 만들거나 켤 때 한 번 */
export function askPermission(): void {
  const n = N();
  if (asked || !n || n.permission !== "default") return;
  asked = true;
  void n.requestPermission().catch(() => {});
}

/** 보냈으면 true */
export function notify(title: string, body: string): boolean {
  const n = N();
  if (!n || n.permission !== "granted" || !windowBehind()) return false;
  try {
    new n(title, { body, silent: true });
    return true;
  } catch {
    return false;
  }
}
