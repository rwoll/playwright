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
import path from 'path';

import { config as loadEnv } from 'dotenv';
loadEnv({ path: path.join(__dirname, '..', '..', '.env') });

import type { Config } from '@playwright/test';

const outputDir = path.join(__dirname, '..', '..', 'test-results');
const testDir = __dirname;
const config: Config = {
  globalSetup: './globalSetup.ts',
  outputDir,
  testDir,
  retries: 0,
  reporter: process.env.CI ? [
    ['dot'],
    ['json', { outputFile: path.join(outputDir, 'report.json') }],
  ] : [
    ['html', { open: 'on-failure' }]
  ],
  globalTimeout: 5400000,
  workers: process.env.CI ? 1 : undefined,
  fullyParallel: !process.env.CI,
  forbidOnly: !!process.env.CI,
};

export default config;
