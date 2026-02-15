# Bug Diagnosis: Playwright Overrides User's JSX Import Source

## What is the bug?

Playwright's Babel transform unconditionally overrides the JSX import source for
all `.tsx` and `.jsx` files, replacing the user's configured JSX runtime with
Playwright's own internal `jsx-runtime`. This means that JSX expressions in test
files always produce Playwright's internal representation (`{ __pw_type: 'jsx',
type, props, key }`) instead of actual React elements, even when the user has
configured React as their JSX runtime via `tsconfig.json`.

## Symptoms

When a user writes a `.tsx` test file that uses JSX with React (e.g., passing JSX
to `renderToStaticMarkup` from `react-dom/server`), the test fails with:

```
Error: Objects are not valid as a React child (found: object with keys
{__pw_type, type, props, key}). If you meant to render a collection of children,
use an array instead.
```

## Root Cause

In `packages/playwright/bundles/babel/src/babelBundleImpl.ts`, the
`@babel/plugin-transform-react-jsx` plugin was configured with a hardcoded
`importSource` pointing to Playwright's own package directory:

```typescript
plugins.push([require('@babel/plugin-transform-react-jsx'), {
  throwIfNamespace: false,
  runtime: 'automatic',
  importSource: path.dirname(require.resolve('playwright')),
}]);
```

This caused **all** JSX in user code to be transformed using Playwright's
`jsx-runtime.js`, which creates `{ __pw_type: 'jsx', ... }` descriptor objects
instead of real React elements. The user's `tsconfig.json` settings for
`jsxImportSource` or `jsx: "react-jsx"` were completely ignored.

## Why does Playwright have its own JSX runtime?

Playwright's custom JSX runtime exists to support Playwright Component Testing
(`@playwright/experimental-ct-*`). In component testing, JSX in test files
describes components to be mounted in the browser, not React elements to be used
in Node.js. The `{ __pw_type: 'jsx', ... }` format is a serializable descriptor
that can be sent to the browser for rendering.

## The Fix

The fix reads `jsxImportSource` and `jsx` settings from the user's
`tsconfig.json` and passes them through to the Babel JSX transform plugin. When
the user has configured a JSX import source (either explicitly via
`jsxImportSource` or implicitly via `jsx: "react-jsx"` which defaults to
`"react"`), Playwright now uses that instead of its own JSX runtime.

### Files Changed

1. **`packages/playwright/src/third_party/tsconfig-loader.ts`**: Added parsing of
   `jsx` and `jsxImportSource` from `compilerOptions` in `tsconfig.json`.

2. **`packages/playwright/src/transform/transform.ts`**: Added
   `jsxImportSourceForFile()` helper to look up the JSX import source from
   tsconfig for a given file, and pass it through to the Babel transform.

3. **`packages/playwright/src/transform/babelBundle.ts`**: Updated
   `BabelTransformFunction` type to accept an optional `jsxImportSource`.

4. **`packages/playwright/bundles/babel/src/babelBundleImpl.ts`**: Updated the
   `@babel/plugin-transform-react-jsx` configuration to use the user's
   `jsxImportSource` when available, falling back to Playwright's own JSX runtime.
