// 역할 목록과 역할 -> 기본 CLI id (B8 slots.ts가 이 표를 가져다 쓴다). null = 일반 Shell.
export const ROLES = ["frontend", "backend", "testers", "reviewers", "design", "docs", "security", "general"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_AGENT: Record<Role, string | null> = {
  reviewers: "claude",
  frontend: "claude",
  design: "claude",
  docs: "claude",
  backend: "codex",
  security: "codex",
  testers: "gemini",
  general: null,
};

const SINGULAR: Record<string, Role> = {
  reviewer: "reviewers", tester: "testers", doc: "docs",
  // K8 S-2433·S-2490: 한국어 역할 이름(영어 키는 그대로)
  리뷰어: "reviewers", 리뷰어들: "reviewers", 테스터: "testers", 테스터들: "testers", 프론트엔드: "frontend", 프론트: "frontend", 백엔드: "backend",
  디자인: "design", 디자이너: "design", 문서: "docs", 보안: "security", 일반: "general",
};

/** "Reviewer"/"reviewers"/"docs" -> 역할, 아니면 null */
export function roleOf(word: string): Role | null {
  const w = word.trim().toLowerCase();
  return (ROLES as readonly string[]).includes(w) ? (w as Role) : SINGULAR[w] ?? null;
}
