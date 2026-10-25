// 역할별 색 토큰 이름 `--role-*` (S-507). 값은 추측 — 4B 에서 정한다. CSS 에 변수가 없으면 아래 대체색.
import { t, tm } from "../i18n";
import type { Role } from "../commandbar/roles";

/** 역할 이름 표시(내부 role 값은 영어 그대로) */
const ROLE_NAME: Record<Role, string> = { general: tm("General"), frontend: tm("Frontend"), backend: tm("Backend"), testers: tm("Testers"), reviewers: tm("Reviewers"), design: tm("Design"), docs: tm("Docs"), security: tm("Security") };
export const roleLabel = (r: Role): string => t(ROLE_NAME[r] ?? r);

const FALLBACK: Record<Role, string> = {
  general: "#9ca3af", frontend: "#38bdf8", backend: "#f97316", testers: "#22c55e", // theme-fixed
  reviewers: "#a855f7", design: "#ec4899", docs: "#eab308", security: "#ef4444", // theme-fixed
};
export const roleColor = (r: Role): string => `var(--role-${r}, ${FALLBACK[r] ?? FALLBACK.general})`;
