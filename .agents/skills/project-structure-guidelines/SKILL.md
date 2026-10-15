---
name: project-structure-guidelines
description: 'Use when adding, changing, or reviewing code structure, architecture, or organization.'
user-invocable: true
---

# Project Structure Guidelines

Follow existing project documentation, code, and tests. Do not assume a stack or impose a new structure.

## Architecture
- Change the module that owns the behavior; preserve its boundaries and dependency direction.
- Reuse established abstractions. Keep changes focused and avoid unrelated refactors.

## Coding
- Match nearby naming, formatting, typing, and error-handling patterns.
- Fix root causes with the smallest clear change; add focused tests for changed behavior.

## Organization
- Place files with the related feature, following the current layout.
- Keep responsibilities cohesive; avoid catch-all modules and unnecessary duplication.
- Update relevant docs when structure or usage changes.

## Workflow
Inspect the owning code and tests, make a focused change, run the narrowest relevant check, and report any checks you could not run.