# LLM Hazard Review Pipeline

## The Clinical Safety Officer (CSO) role

Before starting, and after each stage below, read `/safety/clinical-safety-officer-overview.md`. You are reading this file before each stage to make sure you do not forget important CSO knowledge. The CSO document describes how clinicians use EPR systems, what makes a code issue a clinical safety hazard, and how to think like a CSO. Apply that thinking throughout this analysis.

## Overview

Below is a multi-step LLM pipeline that reviews the entire medical application codebase to identify clinical safety hazards. Each stage outputs to a named file. The LLM identifies and documents hazards but does **not** score them and does **not** implement mitigations, although it can suggest mitigations.

## Stages

Follow the below stages in order:

- Run the prompt in `/safety/hazard-analysis/sub-prompts/stage-1-inventory.md`
- Run the prompt in `/safety/hazard-analysis/sub-prompts/stage-2-discovery.md`
- Run the prompt in `/safety/hazard-analysis/sub-prompts/stage-3-deduplication.md`
- Run the prompt in `/safety/hazard-analysis/sub-prompts/stage-4-hazard-typing.md`
- Run the prompt in `/safety/hazard-analysis/sub-prompts/stage-5-mitigations.md`
- Run the prompt in `/safety/hazard-analysis/sub-prompts/stage-6-structured.md`

For all outputs, overwrite previous entries.
