// S-2442: 한글 조합 중 키 판정 (순수). Enter·방향키가 입력기 몫인지
type K = { isComposing?: boolean; keyCode?: number };
export const isImeEvent = (e: K & { nativeEvent?: K }): boolean => !!(e.isComposing || e.nativeEvent?.isComposing || e.keyCode === 229 || e.nativeEvent?.keyCode === 229);
