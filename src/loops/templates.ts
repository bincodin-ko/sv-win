// D5 S-1416 템플릿 7개(이름은 근거, 값은 추측)
import { tm } from "../i18n";
import type { Trigger } from "./types";

export type Template = { name: string; instruction: string; trigger: Trigger };
const every = (everyMin: number): Trigger => ({ kind: "schedule", everyMin });

export const TEMPLATES: Template[] = [
  { name: tm("Progress check"), trigger: every(30), instruction: tm("Give me a one-line status: what you are working on and what is next.") },
  { name: tm("Keep them moving"), trigger: { kind: "idle" }, instruction: tm("Continue with the next step. If you are blocked, say exactly what you need.") },
  { name: tm("Build rescue"), trigger: { kind: "output", text: "error" }, instruction: tm("The build failed. Find the cause, fix it and run the build again.") },
  { name: tm("Test watchdog"), trigger: every(15), instruction: tm("Run the tests. If anything fails, fix it.") },
  { name: tm("Commit checkpoint"), trigger: every(60), instruction: tm("Commit your work so far with a clear message.") },
  { name: tm("Review sweep"), trigger: every(30), instruction: tm("Review the changes since the last review for bugs and style. List issues only; do not edit.") },
  { name: tm("Hourly standup"), trigger: every(60), instruction: tm("Standup: what did you finish, what are you doing, what is blocked? Two sentences.") },
];
