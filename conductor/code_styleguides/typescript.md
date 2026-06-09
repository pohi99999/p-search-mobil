# TypeScript Style Guide

- Enable strict mode (`"strict": true`) in `tsconfig.json`.
- Do not use `any`. Use `unknown` if the type is truly not known, and narrow it down.
- Define explicit interfaces or types for all component props.
- Prefer `type` for unions/intersections and `interface` for object shapes.
- Use `PascalCase` for type names and `camelCase` for variables and functions.
