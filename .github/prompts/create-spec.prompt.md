---
agent: "agent"
name: create-spec
description: Create technical specification
---

# Create technical specification

## Task

Analyze the codebase and create detailed technical specifications at `/docs/docs/llm/specs.md`.

## Steps

1. **Understand the system:**
   - Read all code, documentation, and configuration files
   - Identify core features and functionality
   - Understand data models and business logic

2. **Document technical specifications:**
   - Define how each feature should work
   - Specify API contracts (endpoints, request/response formats)
   - Document data models and schemas
   - Define business rules and validation logic
   - Specify authentication and authorisation requirements
   - Document error handling and edge cases

3. **Include implementation details:**
   - Technology choices and justifications
   - Design patterns and architectural decisions
   - Integration requirements
   - Performance requirements
   - Security requirements

4. **Avoid hallucination - verify with human:**
   - Document ONLY what exists in the codebase or is explicitly documented
   - Do not invent API endpoints, models, or features that don't exist
   - Do not assume business rules or validation logic not present in code
   - If you find incomplete implementations, mark them: `⚠️ INCOMPLETE: [what's missing]`
   - When technical decisions aren't clear from code, flag: `❓ CLARIFY: [question]`
   - When you must make assumptions, state them explicitly: `🔍 ASSUMPTION: [what you're assuming]`
   - For partially implemented features, describe what exists vs. what seems intended

## Output Format

Organise by feature/module with:

- **Purpose:** What this feature does
- **Requirements:** Functional and non-functional
- **Data Models:** Schemas and relationships
- **API Endpoints:** Full contract specifications
- **Business Rules:** Validation and logic
- **Error Handling:** Expected failure modes
- **Dependencies:** Required services or integrations
- **Questions for Human:** List all `❓ CLARIFY` items
- **Assumptions to Verify:** List all `🔍 ASSUMPTION` items
- **Incomplete Implementations:** List all `⚠️ INCOMPLETE` items

## Ask for clarification in chat

- After you have completed the above, via a numbered list, ask the user to clarify `CLARIFY`, `ASSUMPTIONS` and `INCOMPLETE` items, in the chat.
