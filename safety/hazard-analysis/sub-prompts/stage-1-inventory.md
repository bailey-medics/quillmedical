# Stage 1 - code inventory

**Input**: The codebase root directory.

**Process**: Walk the codebase and produce a structured inventory of every file/component, categorised by function.

## Tier Definitions

Classify each file into exactly one tier:

**Tier 1 — Direct clinical data**: Components that display, capture, store, or transmit patient clinical data. This includes: patient demographics, clinical observations, medications, allergies, diagnoses, referrals, clinical notes, clinical documents, lab results, imaging, care plans, and any component that renders or accepts clinical information.

**Tier 2 — Clinical workflow**: Components that control or influence clinical workflow without directly handling clinical data. This includes: navigation and routing, patient context/selection, session management, access control and RBAC, audit logging, notification systems, task management, and workflow orchestration.

**Tier 3 — Infrastructure**: Backend and frontend infrastructure that clinical data flows through. This includes: API clients and endpoints, data access layers, authentication, FHIR client/integration, OpenEHR integration, database migrations, caching and state management, service workers, error handling, and data transformation/mapping.

**Tier 4 — Non-clinical**: Files with no clinical safety relevance. This includes: styling/CSS, build configuration, development tooling, static assets, landing pages, marketing content, package manifests, linting config, CI/CD config, README files, and type declarations with no clinical content.

## Output Format

**Destination**: `/safety/outputs/stage-1-inventory.md`

Produce the inventory in this exact markdown format:

```markdown
# Stage 1 - Code Inventory

## Tier 1 — Direct Clinical Data

| File                               | Purpose                          | Key Dependencies                      |
| ---------------------------------- | -------------------------------- | ------------------------------------- |
| `src/components/PatientBanner.tsx` | Displays patient identity banner | PatientContext, FHIR Patient resource |

## Tier 2 — Clinical Workflow

| File | Purpose | Key Dependencies |
| ---- | ------- | ---------------- |

## Tier 3 — Infrastructure

| File | Purpose | Key Dependencies |
| ---- | ------- | ---------------- |

## Tier 4 — Non-clinical

| File | Purpose |
| ---- | ------- |
```

## Rules

1. Every file in the codebase must appear in exactly one tier.
2. When in doubt, classify UP (Tier 3 not Tier 4, Tier 2 not Tier 3). Over-inclusion is safer than under-inclusion.
3. For Purpose, write a single sentence describing what the file does.
4. For Key Dependencies, list only the most clinically significant imports.
5. Test files inherit the tier of the code they test.
