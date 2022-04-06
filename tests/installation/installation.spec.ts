/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { test, expect } from './npmTest';

test('global npx playwright --help does not install the browsers', async ({ npx, registry }) => {
  const result = await npx('playwright', '--help');
  expect(result.code).toBe(0);
  expect(`${result.stdout}\n${result.stderr}\n`).not.toMatch(/Downloading.*/);
  registry.assertLocalPackage('playwright');
});

test('global |npx playwright install| installs the browsers, with a warning', async ({ npx, registry }) => {
  const result = await npx('playwright', 'install');
  expect(result.code).toBe(0);
  const combinedOutput = `${result.stdout}\n${result.stderr}\n`;
  expect(combinedOutput).not.toMatch(/Downloading.*chromium/);
  expect(combinedOutput).not.toMatch(/Downloading.*webkit/);
  expect(combinedOutput).not.toMatch(/Downloading.*firefox/);
  expect(combinedOutput).toContain('WARNING');
  expect(combinedOutput).toContain('please install your dependencies first');
  registry.assertLocalPackage('playwright');
});
