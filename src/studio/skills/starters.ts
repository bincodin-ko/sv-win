// 5묶음 E7 S-2082·S-2083: starter 12개. 이름·설명·본문은 우리가 영어로 쓴다(문서에 본문이 없어서 추측). 각 본문 60줄 이하, 설명 한 줄,
// 우리 점검(checkup)에서 No findings(argument-hint 는 Claude Code 전용 필드라 ⑥에 걸려서 starter 는 안 쓴다, 인자는 본문의 $ARGUMENTS), 위험한 일(강제 푸시·삭제·훅 건너뛰기)은 시키지 않는다 — starters.test.ts 가 확인한다.
import { tm } from "../../i18n";
export interface Starter { name: string; title: string; description: string; argumentHint?: string; body: string }

export const STARTERS: Starter[] = [
  {
    name: "commit", title: tm("Commit"),
    description: tm("Write a clear commit message for the staged changes and commit them."),
    body: `Commit the staged changes.

1. Run git status and git diff --staged to see exactly what is staged. If nothing is staged, say so and stop.
2. Write a commit message:
   - A subject line of at most 50 characters, in the imperative mood ("Fix", "Add", "Rename").
   - A blank line, then a short body that explains why the change was made, not what the diff already shows.
3. Commit with git commit and the message.
4. Show the resulting commit with git log -1 --stat.

Do not stage extra files. Do not push.`,
  },
  {
    name: "pr-description", title: tm("PR description"),
    description: tm("Draft a pull request description from the commits on this branch."),
    body: `Write a pull request description for the current branch.

1. Find the base branch (usually main) and run git log and git diff against it.
2. Write the description with these sections:
   - Summary: two or three sentences on what changed and why.
   - Changes: a short bullet list grouped by area.
   - Testing: how the change was verified, and anything left unverified.
   - Risks: what could break and how to roll back.
3. Keep it under 300 words and plain Markdown.

Print the description so I can copy it. Do not open the pull request yourself.`,
  },
  {
    name: "changelog", title: tm("Changelog"),
    description: tm("Add a changelog entry that summarizes recent changes for users."),
    body: `Update the changelog.

1. Find the changelog file (CHANGELOG.md or similar). If there is none, ask before creating one.
2. Read the commits since $ARGUMENTS. If no starting point was given, use the last tag.
3. Group the changes under Added, Changed, Fixed and Removed. Skip refactors and chores that users cannot see.
4. Write each line from the user's point of view, in one sentence.
5. Put the new entry at the top, under the existing heading style.

Show me the diff of the changelog when you are done.`,
  },
  {
    name: "test-first", title: tm("Test first"),
    description: tm("Write a failing test for a change, then make it pass."),
    body: `Work test first on: $ARGUMENTS

1. Find the existing tests and copy their style and tooling.
2. Write the smallest test that describes the wanted behavior.
3. Run only that test and confirm it fails for the right reason. Show me the failure.
4. Write the minimum code that makes it pass.
5. Run the test again, then the nearby tests, and report the results.

Never weaken or delete a test to get a pass. If the test itself looks wrong, stop and tell me why.`,
  },
  {
    name: "bug-hunt", title: tm("Bug hunt"),
    description: tm("Find the root cause of a bug before proposing a fix."),
    body: `Investigate this bug: $ARGUMENTS

1. Restate the symptom and how to reproduce it. If you cannot reproduce it, say what you tried.
2. Trace the code path from the entry point to the failure. Name the files and lines you read.
3. List the two or three most likely causes and the evidence for and against each.
4. Confirm the real cause with a small experiment, a log line, or a failing test.
5. Propose the fix at the root cause, and mention other callers that share the same flaw.

Do not change code until the cause is confirmed. Then keep the fix small.`,
  },
  {
    name: "refactor-plan", title: tm("Refactor plan"),
    description: tm("Plan a safe, step-by-step refactor without changing behavior."),
    body: `Plan a refactor of: $ARGUMENTS

1. Read the code and its callers. Describe what it does today in a few sentences.
2. Say what is hard about it now: duplication, unclear names, tangled responsibilities.
3. Propose a sequence of small steps. After each step the tests must still pass and the app must still run.
4. For each step, name the files touched and how to check that behavior did not change.
5. Flag anything that has no tests yet, and suggest adding them first.

Only write the plan. Do not edit any files.`,
  },
  {
    name: "api-docs", title: tm("API docs"),
    description: tm("Document the public functions and endpoints of a module."),
    body: `Write API documentation for: $ARGUMENTS

1. List the public functions, classes, or endpoints. Skip private helpers.
2. For each one give a one-line purpose, the parameters with types, the return value, and the errors it can raise.
3. Add one short, correct usage example per item. Check each example against the code.
4. Match the documentation style already used in this repo (doc comments or a docs folder).

Put the result where the repo keeps its docs, or print it if there is no such place.`,
  },
  {
    name: "standup", title: tm("Standup"),
    description: tm("Summarize recent work as a short standup update."),
    body: `Write my standup update.

1. Read my commits from the last $ARGUMENTS days (one day if empty) with git log, using my git author name.
2. Also check git status for work in progress.
3. Write three short sections:
   - Yesterday: what was finished.
   - Today: what is in progress or next, inferred from the branch and open changes.
   - Blockers: anything that looks stuck. Write "None" if nothing is.
4. Keep each line to one sentence in plain language.`,
  },
  {
    name: "explain", title: tm("Explain"),
    description: tm("Explain how a piece of code works, from the big picture down."),
    body: `Explain: $ARGUMENTS

1. Start with one paragraph on what it is for and where it fits in the project.
2. Walk through the main flow step by step, naming the files and functions involved.
3. Point out any surprising decisions, hidden assumptions, or traps for someone changing it.
4. End with a short list of the files to read first.

Assume I am a capable developer who has not seen this part before. Do not edit anything.`,
  },
  {
    name: "perf-pass", title: tm("Perf pass"),
    description: tm("Find and fix the biggest performance problem with measurements."),
    body: `Run a performance pass on: $ARGUMENTS

1. Define what slow means here and how to measure it. Take a baseline number first.
2. Find the hot spot with a profiler, a timer, or a count of repeated work. Do not guess.
3. Fix the single biggest cost with the simplest change that works.
4. Measure again and report the before and after numbers.
5. If the gain is under 10 percent, say so and consider reverting the change.

Keep behavior identical and make sure the tests still pass.`,
  },
  {
    name: "deps-audit", title: tm("Deps audit"),
    description: tm("Review dependencies for outdated, unused, and risky packages."),
    body: `Audit this project's dependencies.

1. Find the manifest and lock files, and list the direct dependencies.
2. Run the ecosystem's outdated and audit commands (for example npm outdated and npm audit).
3. Search the code to find dependencies that are never imported.
4. Report three groups: security problems, safe upgrades, and packages to remove or replace.
5. For each item give the package, the current and wanted versions, and the risk of upgrading.

Only report. Do not change any version or install anything until I say so.`,
  },
  {
    name: "readme-refresh", title: tm("README refresh"),
    description: tm("Bring the README back in line with the code."),
    body: `Refresh the README.

1. Read the README and the project files: manifest, scripts, entry points, config.
2. Check each claim in the README against the code: install steps, commands, options, file paths.
3. Fix what is wrong or missing. Keep the existing tone and structure.
4. Make sure a new reader can install, run, and test the project using only the README.
5. List the changes you made at the end.

Do not invent features. If something is unclear, ask me instead of guessing.`,
  },
];
