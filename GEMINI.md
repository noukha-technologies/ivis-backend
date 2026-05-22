# GEMINI.md — Antigravity-Specific Overrides

> Antigravity IDE specific settings - takes precedence over AGENTS.md

---

## Antigravity Behavior

### Response Style
- Be extremely concise - show implementation, not explanations
- Skip tutorials and basic syntax lessons
- Prefer code over prose
- When in doubt, ask one focused question

### Code Generation
- Always inspect existing patterns before generating new code
- Reuse established conventions strictly
- Partial updates only - never rewrite entire files
- Trust the existing project structure

### Token Optimization
- Implementation-focused responses only
- No basic NestJS/TypeScript explanations
- Minimal inline comments
- Skip unchanged code in responses
- Reference existing patterns instead of recreating

---

## Antigravity Agentic Features

### Planning
- Brief plan for complex changes only
- Skip long pseudocode
- Skip step-by-step narration for simple edits

### Artifacts
- Use `task.md` for granular sub-tasks
- Include security implications in `implementation_plan.md`
- Keep walkthroughs focused on critical changes

### Turbo Mode
- Use `// turbo` for safe, repeatable commands
- Automate linting, formatting, type-checking
- Never automate destructive operations

---

## Safety Guardrails

### Critical Confirmations Required
- Always ask before writing to database
- Always ask before deleting files
- Always ask before deployment operations
- Never commit secrets to git

### Auto-Continue Limits
- Stop and ask if potential bug detected
- Stop and ask if architectural change needed
- Stop and ask if breaking API contract

---

## Design Philosophy

### Backend API Focus
- Prioritize correctness over aesthetics
- Information density over UI polish
- Standard REST conventions
- Clean JSON responses

---

## Project-Specific Notes

### Import Paths
- Use `.js` suffix (TypeScript `nodenext`)

### Environment Variables
- Read from `process.env` in `main.ts`
- No DI token constants unless explicitly requested

### Module Organization
- Database module is `@Global()`
- Feature modules are isolated
- No `SharedModule` - use `PaginationModule` only

---

**Note:** These rules override conflicting rules in AGENTS.md. Both files work together - AGENTS.md provides the foundation, GEMINI.md provides Antigravity-specific tuning.