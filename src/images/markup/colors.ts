// S-886: Markup 색 8개(펜과 같은 표, S-865). 그림 픽셀에 구워지는 값이라 테마를 따라가지 않는다
export const MARKUP_COLORS = [["Red", "#ef4444"], ["Orange", "#f97316"], ["Yellow", "#eab308"], ["Green", "#22c55e"], ["Blue", "#3b82f6"], ["Violet", "#a78bfa"], ["White", "#ffffff"], ["Black", "#000000"]] as const; // theme-fixed
/** 굵기 4개(원본 이미지 픽셀 기준, 추측) */
export const MARKUP_WIDTHS = [2, 4, 7, 12] as const;
