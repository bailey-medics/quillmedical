---
agent: "agent"
name: create-architecture
description: Create architecture documentation
---

# Create Architecture Documentation

## Task

Analyse the codebase and create comprehensive architecture documentation at `/docs/docs/llm/architecture.md`.

## Steps

1. **Understand the system:**
   - Read all code, documentation, and configuration files
   - Identify all services, databases, and external integrations
   - Understand deployment structure (Docker Compose, containers, networks)
   - Map data flow between components

2. **Document architectural decisions:**
   - System components and their responsibilities
   - Database strategy (why multiple databases, what each stores)
   - Service communication patterns (networks, protocols, security)
   - File storage strategy and rationale
   - Authentication and authorisation architecture
   - Integration patterns (FHIR, OpenEHR, object storage)
   - Key design patterns in use

3. **Include strategic context:**
   - Technology choices and justifications
   - Why this architecture vs. alternatives
   - Scalability considerations and migration paths
   - Security boundaries and isolation strategies
   - Performance characteristics
   - Backup and disaster recovery approach

4. **Avoid hallucination - verify with human:**
   - Document ONLY the architecture that exists in docker-compose files, code, and documentation
   - Do not invent services, databases, or integrations that don't exist
   - Do not assume future architecture without evidence in roadmap/docs
   - If architectural decisions aren't clear, flag: `❓ CLARIFY: [question]`
   - When you must infer architectural rationale, state: `🔍 ASSUMPTION: [what you're assuming]`
   - If architecture seems incomplete or inconsistent, mark: `⚠️ INCOMPLETE: [what's unclear]`

## Output Format

Structure as:

- **System Overview:** High-level description with component diagram
- **Service Architecture:** Each service's role, technology, and responsibilities
- **Database Strategy:** Why separated, what each stores, access patterns
- **Storage Architecture:** File storage approach and rationale
- **Network Architecture:** Service communication, security boundaries
- **Integration Patterns:** How services interact (FHIR, OpenEHR, APIs)
- **Security Architecture:** Authentication, authorisation, data protection
- **Scalability & Migration:** Current limits, growth paths, future plans
- **Key Architectural Decisions:** Major choices and their justifications
- **Questions for Human:** List all `❓ CLARIFY` items
- **Assumptions to Verify:** List all `🔍 ASSUMPTION` items
- **Architectural Gaps:** List all `⚠️ INCOMPLETE` items

## Ask for clarification in chat

- After you have completed the above, via a numbered list, ask the user to clarify `CLARIFY`, `ASSUMPTION` and `INCOMPLETE` items, in the chat.
