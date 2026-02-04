# Create Implementation Roadmap

## Task

Analyse the entire codebase and create a comprehensive implementation roadmap at `/docs/docs/llm/roadmap.md`.

## Steps

1. **Discover the application:**
   - Read all documentation, configuration, and source code files
   - Identify the application's purpose, domain, and tech stack
   - Understand the architecture and key integrations
   - Read the `/docs/docs/llm/specs.md` file

2. **Analyse current implementation:**
   - Identify all implemented features and functionality
   - Note partially implemented or incomplete features
   - Document current architecture and technical decisions

3. **Create implementation roadmap:**
   - Use markdown checkboxes `- [ ]` for incomplete items
   - Use `- [x]` for completed items (based on code analysis)
   - Organise logically by feature area or functional domain
   - Order tasks by dependency and priority

4. **Identify next steps:**
   - Critical missing functionality for MVP
   - Technical debt or improvement areas
   - Future enhancements

5. **Avoid hallucination - verify with human:**
   - Base roadmap ONLY on evidence found in code, docs, and configs
   - Do not invent features that aren't mentioned anywhere
   - Do not assume requirements beyond what's documented or partially implemented
   - If you see patterns suggesting a feature but no concrete evidence, flag it with: `⚠️ VERIFY: [description]`
   - When uncertain about priorities or next steps, ask: `❓ CLARIFY: [question]`
   - Mark any assumptions clearly: `🔍 ASSUMPTION: [what you're assuming]`

## Output Format

- **Executive Summary:** Current state overview
- **Completed Features:** What's done (with checkboxes)
- **In Progress:** Partially implemented features
- **Planned Features:** Organised by priority with checkboxes
- **Questions for Human:** List all `❓ CLARIFY` items
- **Assumptions to Verify:** List all `🔍 ASSUMPTION` items
- **Incomplete Implementations:** List all `⚠️ INCOMPLETE` items
- **Technical Debt:** Known issues
- **Future Enhancements:** Long-term goals

## Ask for clarification in chat

- After you have completed the above, via a numbered list, ask the user to clarify `CLARIFY`, `ASSUMPTIONS` and `INCOMPLETE` items, in the chat.
