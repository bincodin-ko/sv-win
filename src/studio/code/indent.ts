// 5묶음 E4 S-1875: Tab 은 공백 2칸(선택 영역은 대신 들어간다)
export const indentTab = (text: string, start: number, end: number): { text: string; start: number; end: number } =>
  ({ text: text.slice(0, start) + "  " + text.slice(end), start: start + 2, end: start + 2 });
