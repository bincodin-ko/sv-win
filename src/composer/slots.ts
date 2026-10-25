// B8 슬롯 순수 함수 (S-525·S-531·S-523)
import { ROLE_AGENT, type Role } from "../commandbar/roles";

export const MAX_SLOTS = 12;
export const SLOT_GAP = 24;
export type Slot = { agent: string; touched: boolean };

/** n개 칸의 격자: 열 수 ceil(sqrt n), 칸 간격 24. cells 는 덩어리 왼쪽 위 기준 칸 왼쪽 위 좌표 */
export function gridLayout(n: number, size: { w: number; h: number } = { w: 720, h: 440 }) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.ceil(n / cols);
  const cells = Array.from({ length: n }, (_, i) => ({ x: (i % cols) * (size.w + SLOT_GAP), y: Math.floor(i / cols) * (size.h + SLOT_GAP) }));
  return { cols, rows, cells };
}
/** 역할의 기본 에이전트: 표의 CLI 가 설치돼 있으면 그것, 아니면(또는 표가 null 이면) 기본 에이전트 */
export function defaultAgentForRole(role: Role, installed: string[], defaultAgent: string): string {
  const a = ROLE_AGENT[role];
  return a && installed.includes(a) ? a : defaultAgent;
}
/** 순환: 다음 에이전트(끝에서 처음으로). 목록에 없으면 첫 번째 */
export function cycleAgent(list: string[], current: string): string {
  const i = list.indexOf(current);
  return list[(i + 1) % list.length] ?? current;
}
/** 역할을 바꾼다: 손대지 않은 슬롯만 새 역할 기본으로 */
export function rolesDefaults(slots: Slot[], role: Role, installed: string[], defaultAgent: string): Slot[] {
  const d = defaultAgentForRole(role, installed, defaultAgent);
  return slots.map((s) => (s.touched ? s : { agent: d, touched: false }));
}
/** 슬롯 수를 1~12 로 맞춘다. 늘어난 칸은 역할 기본(손대지 않음) */
export function resizeSlots(slots: Slot[], n: number, role: Role, installed: string[], defaultAgent: string): Slot[] {
  const k = Math.min(MAX_SLOTS, Math.max(1, n));
  const d = defaultAgentForRole(role, installed, defaultAgent);
  return Array.from({ length: k }, (_, i) => slots[i] ?? { agent: d, touched: false });
}
