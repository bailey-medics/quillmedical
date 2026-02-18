---
agent: "agent"
model: Claude Sonnet 4.6 (copilot)
name: test
description: Code documentation
---

# Code documentation

## Review all code

- Read through the entire code base and document as below.

## Python

Add / update comprehensive Google-style docstrings to all functions, classes, and methods. For each:

- Summary: Brief description of purpose
- Args: parameter descriptions with types
- Returns: return value description with type
- Raises: any exceptions thrown
- Examples: only for complex functions where usage isn't obvious - use sparingly

Also, add / update summary module documentation at the top of the module.

## TypeScript

Add / update comprehensive TSDoc comments to all functions, classes, and methods. For each:

- Summary: Brief description of purpose
- @param: parameter descriptions (types inferred from TypeScript)
- @returns: return value description (type inferred from TypeScript)
- @throws: any exceptions thrown
- @example: only for complex functions where usage isn't obvious - use sparingly

Also, add / update summary module documentation at the top of the module.

## React Components

Follow the TypeScript standards above. Additionally:

- Add component-level TSDoc describing the component's purpose
- Document all props in the Props/interface definition
- Add usage examples in TSDoc only for complex components

## Storybook Stories

Stories are self-documenting through their structure. Ensure:

- Each story file has a clear `title` in the meta export
- Complex components have a `description` in the meta export
- All argTypes have clear `description` fields
- Story names clearly describe what they demonstrate
- Do NOT add TSDoc comments to individual story objects

## Tests

Tests should be self-documenting through descriptive names and clear structure. Only document:

- Test utilities and helper functions (using same standards as above)
- Test data factories and fixtures
- Complex test setup that isn't obvious from the code
- Shared test configuration

Individual test cases should not have documentation comments - use descriptive test names instead.
