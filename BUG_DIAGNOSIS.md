## Bug diagnosis

Playwright's Babel transform always compiled JSX using Playwright's custom `playwright/jsx-runtime`.
That runtime returns serialized objects (for example `{ __pw_type: 'jsx', ... }`) that are needed for Component Testing, but are not valid React elements.

Because this transform was applied to regular `@playwright/test` files too, JSX values in normal tests were not React elements anymore.
Code that expects real React elements (for example `react-dom/server`'s `renderToStaticMarkup`) then failed with:

`Objects are not valid as a React child (found: object with keys {__pw_type, type, props, key})`.

### Fix

Use React's default JSX runtime (`importSource: 'react'`) for normal Playwright Test transformation.
Keep using Playwright's custom JSX runtime only when Component Testing's `playwright-ct-core` transform plugin (`tsxTransform`) is active.
