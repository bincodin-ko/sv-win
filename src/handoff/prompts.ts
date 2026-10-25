// S-1683·S-1686: 요약 요청과 브리프 문구(추측 문구는 이 파일 한 곳)
export const SUMMARY_REQUEST = "Please summarize this task and where it stands, so another agent can continue it from exactly this state. Reply with the summary only.";
export const CONTINUE = "Continue this task from exactly that state.";
export const brief = (summary: string): string => `${summary.trim()} ${CONTINUE}`;
