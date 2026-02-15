# Bug Diagnosis: Incorrect Content-Type in Range Responses

## What is the Bug?

In `packages/playwright-core/src/server/utils/httpServer.ts`, the `_serveRangeFile` method uses a
TypeScript non-null assertion (`!`) on the return value of `mime.getType()` when setting the
`Content-Type` response header. Since `mime.getType()` returns `null` for unrecognized file
extensions, this results in the HTTP response header being set to `Content-Type: null` — a
malformed value that can confuse browsers and HTTP clients.

**Before (buggy):**
```typescript
'Content-Type': mime.getType(path.extname(absoluteFilePath))!,
```

**After (fixed):**
```typescript
'Content-Type': mime.getType(path.extname(absoluteFilePath)) || 'application/octet-stream',
```

## Why Does the Bug Occur?

The sibling method `_serveFile` (used for non-range requests) already handles the `null` case
correctly by providing a fallback:

```typescript
const contentType = mime.getType(path.extname(absoluteFilePath)) || 'application/octet-stream';
```

However, when the `_serveRangeFile` method was implemented, this fallback was omitted and a
non-null assertion was used instead. This means:

- **Normal (non-range) requests** correctly fall back to `application/octet-stream` for
  unrecognized file types.
- **Range requests** (HTTP 206 Partial Content) send `Content-Type: null`, which is invalid.

The inconsistency causes problems when browsers or HTTP clients make range requests for files
with extensions that are not in the MIME type database. This can break media streaming, file
downloads, and any other functionality that relies on range requests.

## Location of the Fix

- **File:** `packages/playwright-core/src/server/utils/httpServer.ts`
- **Method:** `_serveRangeFile`
- **Line:** 196 (the `Content-Type` header in the `response.writeHead(206, ...)` call)

## Tests

Tests were added in `tests/playwright-test/http-server.spec.ts` to verify that:

1. Range requests on files with known MIME types (e.g., `.html`) include the correct
   `Content-Type` header.
2. Range requests on files with unrecognized extensions fall back to
   `application/octet-stream` instead of sending `null`.
