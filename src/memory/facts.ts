// S-1363·S-1364·S-1368: 사실 한 줄 요약·종류·카드 중복 판정 (순수)
import { tm } from "../i18n";
import type { MemoryFact } from "../lib/ipc";
import type { BoardNode } from "../board/store";

export const KINDS = ["Architecture", "Structure", "Commands", "Conventions", "Gotchas", "Context"] as const;
export type Kind = (typeof KINDS)[number];
/** 사전 점검용 — 종류 이름은 저장 값(영어)이고, 그릴 때 t(kind) */
export const KIND_LABELS: Record<Kind, string> = { Architecture: tm("Architecture"), Structure: tm("Structure"), Commands: tm("Commands"), Conventions: tm("Conventions"), Gotchas: tm("Gotchas"), Context: tm("Context") };
export type Draft = { id?: string; kind: string; title: string; body: string; scope: "repo" | "all" };

export const kindVar = (kind: string): string => `--mem-${kind.toLowerCase()}`;
export const repoName = (path: string): string => path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? path;
/** 본문 첫 줄(빈 줄은 건너뜀) 100자 */
export const summary = (body: string): string => (body.split(/\r?\n/).find((l) => l.trim()) ?? "").slice(0, 100);
export const canSave = (title: string): boolean => title.trim().length > 0;
export const newFact = (d: Draft): MemoryFact => ({ id: d.id ?? crypto.randomUUID(), kind: d.kind, title: d.title.trim(), body: d.body, scope: d.scope, at: new Date().toISOString() });
/** 이 보드에 이미 놓인 memory 카드 id */
export const findCard = (nodes: Record<string, BoardNode>): string | null => Object.values(nodes).find((n) => n.kind === "memory")?.id ?? null;
