# Bug Diagnosis: Playwright Ignores tsconfig JSX Settings

## Problem Overview

Playwright's code transformation system was not respecting user-configured JSX settings from `tsconfig.json`. This caused JSX elements to always be transformed using Playwright's internal jsx-runtime, which creates objects with a `__pw_type: 'jsx'` marker instead of real React elements.

## Observed Error

When running Playwright tests on code that uses React APIs expecting real React elements (such as `renderToStaticMarkup` from `react-dom/server`), users encountered:

```
Error: Objects are not valid as a React child (found: object with keys {__pw_type, type, props, key})
```

## Why This Happened

In the file `packages/playwright/bundles/babel/src/babelBundleImpl.ts`, the JSX transform was hardcoded:

The `importSource` was always set to Playwright's directory, which contains a custom `jsx-runtime.js` that returns Playwright-specific objects rather than React elements. This happened regardless of what the user configured in their `tsconfig.json`.

## Resolution

The fix teaches Playwright to read and respect JSX-related settings from `tsconfig.json`:

### Changes Made

1. **tsconfig-loader.ts**: Now extracts `jsx` and `jsxImportSource` from the compilerOptions section of tsconfig files.

2. **transform.ts**: Added logic to determine the appropriate JSX options for each file being transformed. When `jsx` is set to `react-jsx` or `react-jsxdev`, it defaults the import source to `react` (matching TypeScript's behavior).

3. **babelBundleImpl.ts**: The Babel JSX transform plugin now accepts an optional import source parameter. When the user has configured a JSX setting, that takes precedence over Playwright's default.

4. **babelBundle.ts**: Updated the type definitions to support the new JSX options parameter.

## Post-Fix Behavior

| User's tsconfig.json | Resulting JSX Runtime |
|---------------------|----------------------|
| `jsx: "react-jsx"` | React's jsx-runtime (creates real React elements) |
| `jsx: "react-jsx"` + `jsxImportSource: "preact"` | Preact's jsx-runtime |
| No JSX config specified | Playwright's jsx-runtime (backward compatible) |

## Verification

The fix was verified against the reproduction repository at https://github.com/rwoll/repro-static-html-playwright-error.git. All 4 tests that previously failed now pass.

Additionally, two new test cases were added to the Playwright test suite to ensure this behavior is maintained going forward.
