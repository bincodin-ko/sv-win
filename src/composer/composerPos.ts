// S-2680: 명령줄 윗변 위로 8px 띄워 놓는다. 화면 위로는 안 넘친다
export const composerTop = (barTop: number, height: number): number => Math.max(8, barTop - height - 8);
