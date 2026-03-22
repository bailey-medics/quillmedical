---
agent: "agent"
name: write-a-plan
description: Synthesise a conversation into a structured plan document
---

# Write a plan document

You have had a discussion in this chat about a specific topic or task. Your job is to synthesise this into a structured plan document that a coding agent can follow step by step.

## Rules for writing the plan

- Extract the **goal** — one or two sentences describing what done looks like
- Break the work into **discrete, ordered steps** — each step should be a single self-contained change
- Each step must include:
  - What to do (specific, not vague)
  - What files or systems are affected
  - How to know the step is complete (acceptance criterion)
- Flag any **ambiguities or open questions** that need resolving before work begins and ask the user to clarify
- Flag any **dependencies** between steps explicitly
- Do not invent requirements that were not discussed — if something is unclear, surface it as a question and
- Write the plan into the markdown document attached. If no document is attached, inform the user to create one and attach it
- Stop work and ask all of your questions before writing the plan. Do not write a plan until you have all the information you need.

## Output format

Produce a markdown document with the following structure:

### Goal
[One or two sentences]

### Open questions
[List any ambiguities that must be resolved before starting — or "None"]

### Steps
#### Step 1: [Short title]
- **What:** ...
- **Affects:** ...
- **Done when:** ...

#### Step 2: ...

### Out of scope
[Anything explicitly excluded or deferred]
