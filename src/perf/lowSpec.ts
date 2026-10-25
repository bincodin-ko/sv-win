// 9묶음 저사양 모드: 설정 lowSpec 하나만 본다. 컴포넌트는 useLowSpec(), 그 밖은 isLowSpec().
import { useSettings } from "../settings/useSettings";

export const isLowSpec = (): boolean => useSettings.getState().s.lowSpec === true;
export const useLowSpec = (): boolean => useSettings((st) => st.s.lowSpec === true);
