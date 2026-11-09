# Agent Instructions

## Basic Principles
- Maintain the existing project structure as much as possible.
- Analyze the relevant code before modifying the code.
- Ensure that existing functionality is not affected.
- Do not add libraries arbitrarily.
- **Never push directly to `main` branch.** Strictly follow `docs/GIT_BRANCHING_STRATEGY.md`. Always branch from `develop` into `feature/<area>-<name>` and merge via quality gates.
- Commit changes by logical unit using Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `style:`) whenever a unit of work is completed.

## At the start of the operation
1. Read `docs/PROJECT_CONTEXT.md`.
2. Read `docs/TASKS.md` to understand the current progress.
3. Check `docs/DECISIONS.md` to review the existing decisions.
4. Check `docs/GIT_BRANCHING_STRATEGY.md` to ensure working on the appropriate `feature/*` or `develop` branch.

## At task completion
1. Update the progress on `docs/TASKS.md`.
2. Record important technical decisions at `docs/DECISIONS.md`.
3. Summarize the changed code and the test results.
4. Record incomplete tasks and precautions.
5. Commit changes by logical unit.

## Maintain conversation context
- Do not arbitrarily infer previous actions.
- For anything not recorded, verify the actual code.
- Even if you start working on a new PC, continue from where you left off in your document.
