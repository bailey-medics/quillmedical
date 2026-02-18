---
agent: "agent"
model: Claude Sonnet 4.5
name: strong-static-typing-defensive-programming
description: Strong static typing and defensive programming
---

# Strong static typing and defensive programming

## Codebase Refactoring Task: Type Safety & Defensive Programming

Execute the following systematic improvements across the Quill codebase:

### Phase 1 - Python Type Safety

- Scan all Python files and add comprehensive type hints (function parameters, return types, class attributes)
- Use `typing` module types (Optional, Union, List, Dict, etc.) where appropriate
- Ensure all functions/methods have complete type annotations
- Run full test suite to verify no regressions

### Phase 2 - TypeScript Type Safety

- Review all TypeScript files for `any` types and replace with specific types
- Add explicit return type annotations to all functions
- Ensure strict TypeScript config compliance (`strict: true`)
- Run full test suite to verify no regressions

### Phase 3 - Python Defensive Programming

- Add input validation at the start of every function/method
- Validate argument types, ranges, null checks, and constraints
- Raise appropriate exceptions (ValueError, TypeError) with descriptive messages
- Run full test suite to verify no regressions

### Phase 4 - TypeScript Defensive Programming

- Add runtime input validation at function entry points
- Implement type guards and null checks where needed
- Throw appropriate errors with clear messages
- Run full test suite to verify no regressions

## Critical Rules

- Test after EACH phase before proceeding
- Do not modify business logic
- Preserve existing functionality exactly
- Document any assumptions made during validation
