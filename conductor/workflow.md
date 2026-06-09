# Project Workflow

## 1. Task Execution
- Break down every Phase into small, manageable Tasks.
- If Test-Driven Development (TDD) is active, write the test before implementing the feature.
- Verify changes before considering a task complete.

## 2. Commit Strategy
- **Per Task:** Commit code immediately after a Task is completed and verified.
- **Commit Messages:** Follow Conventional Commits format (e.g., `feat: Add login screen`, `fix: Resolve auth token issue`).
- Task summaries will be stored in the commit message body.

## 3. Testing & Coverage
- Mandatory coverage threshold: >80%
- Run test suites locally before pushing.

## 4. Phase Completion Verification
- **Protocol:** At the end of every Phase, a final task must run to verify that all requirements of the Phase are met, the code is formatted, and the Git working tree is clean.
