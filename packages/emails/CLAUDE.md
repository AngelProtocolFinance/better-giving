# emails

React Email templates as a pure component library, workspace member `emails` (private). `src/` only — templates + shared components, no build tooling, no deploy.

- **platform** imports it via `workspace:*` — the package exports raw source (`exports: "./src/index.ts"`), so there's no build/`dist`; platform's compiler transpiles the `.tsx`. `src/index.ts` is the barrel (`export * as <name>` per template + `export type * from "./types"`).
- external deps are only `react` + `react-email` (the primitives). No `next`/`@react-email/ui` — that preview toolchain lives in the `emails-preview` member.
- **previewing templates** lives in the sibling `emails-preview` member (`pnpm dev:emails-preview`), which depends on this package and renders each template. See `emails-preview/CLAUDE.md`.

# Coding Style Preferences

## Naming Conventions

- **Variables and functions**: Use `snake_case` as much as possible
- **React components**: Use `PascalCase` (e.g., `MyComponent`)
- **File names**: Use `kebab-case` (e.g., `my-component.tsx`)

## Examples

```typescript
// Variables and functions
const user_name = "John";
const fetch_user_data = async () => { ... };

// React components
function UserProfile() { ... }
export const DonationForm = () => { ... };

// File names
// ✓ user-profile.tsx
// ✓ donation-form.tsx
// ✗ UserProfile.tsx
// ✗ donation_form.tsx
```

## React Component Design

- **Props-based design**: Make components reusable by accepting configuration as props rather than deriving values internally. This improves SSR compatibility, testability, and flexibility
- **Define interfaces**: Always define proper TypeScript interfaces for component props (e.g., `AccountSelectorProps` for `AccountSelector` component)
- **Use existing patterns**: Check the codebase for existing design system classes and patterns before creating custom ones
- **Provide fallbacks**: Use sensible fallbacks for optional props (e.g., `logo || default_logo`)
- **Keep it concise**: Prefer compact, inline layouts over verbose sections with extra headings unless the UI demands it
- **Component naming**: Keep component names clear and concise

## Code Comments

- **Comments are for code readers only**: Don't add comments intended for the prompter (e.g., "Add your API key here", "TODO: implement this feature"). Only add comments that help someone reading and maintaining the code understand what it does and why
- **Use lowercase**: Write comments in lowercase as much as possible (e.g., `// submit form and navigate to next step` instead of `// Submit form and navigate to next step`)

## Development Workflow

- **Always check package.json for scripts**: Before running any npm/pnpm commands (like `pnpm test:run`, `pnpm build`, etc.), always check `package.json` first to see what scripts are actually available. Use the exact script names defined there
