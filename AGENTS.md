# Agent Instructions

## Basic Principles
- Maintain the existing project structure as much as possible.
- Analyze the relevant code before modifying the code.
- Ensure that existing functionality is not affected.
- Do not add libraries arbitrarily.
- Commit changes by logical unit using Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `style:`) whenever a unit of work is completed.

## At the start of the operation
1. Read PROJECT_CONTEXT.md.
2. Read TASKS.md to understand the current progress.
3. Check DECISIONS.md to review the existing decisions.

## At task completion
1. Update the progress on TASKS.md .
2. Record important technical decisions at DECISIONS.md .
3. Summarize the changed code and the test results.
4. Record incomplete tasks and precautions.
5. Commit changes by logical unit.

## Maintain conversation context
- Do not arbitrarily infer previous actions.
- For anything not recorded, verify the actual code.
- Even if you start working on a new PC, continue from where you left off in your document.
