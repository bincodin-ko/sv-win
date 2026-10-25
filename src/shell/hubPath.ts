// H5 S-2873: Hub 보드의 셸 자리 이름은 "hub:<id>". 화면 쪽 판정은 모두 이 함수 하나로.
export const hubPathOf = (id: string): string => `hub:${id}`;
export const isHub = (path: string | null | undefined): boolean => typeof path === "string" && path.startsWith("hub:");
