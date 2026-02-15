/**
 * Copyright Microsoft Corporation. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import { test, expect } from './playwright-test-fixtures';
import { HttpServer } from '../../packages/playwright-core/lib/server/utils/httpServer';

// Sends a raw HTTP GET and collects status, headers, and body.
function rawGet(url: string, hdrs?: Record<string, string>) {
  return new Promise<{ sc: number, rh: http.IncomingHttpHeaders, bd: string }>((resolve, reject) => {
    http.get(url, { headers: hdrs }, r => {
      const acc: string[] = [];
      r.on('data', (c: Buffer) => acc.push(c.toString()));
      r.on('end', () => resolve({ sc: r.statusCode!, rh: r.headers, bd: acc.join('') }));
    }).on('error', reject);
  });
}

test('range request preserves Content-Type for .html files', async ({}, testInfo) => {
  const srv = new HttpServer();
  const fp = path.join(testInfo.outputDir, 'sample.html');
  fs.mkdirSync(testInfo.outputDir, { recursive: true });
  fs.writeFileSync(fp, '<section>Range test payload</section>');

  srv.routePath('/sample.html', (rq, rs) => { srv.serveFile(rq, rs, fp); return true; });
  await srv.start({ host: '127.0.0.1' });
  try {
    const normal = await rawGet(`${srv.urlPrefix('precise')}/sample.html`);
    expect(normal.sc).toBe(200);
    expect(normal.rh['content-type']).toBe('text/html');

    const ranged = await rawGet(`${srv.urlPrefix('precise')}/sample.html`, { 'Range': 'bytes=0-8' });
    expect(ranged.sc).toBe(206);
    expect(ranged.rh['content-type']).toBe('text/html');
    expect(ranged.bd).toBe('<section>');
  } finally {
    await srv.stop();
  }
});

test('range request falls back to octet-stream for unrecognized extensions', async ({}, testInfo) => {
  const srv = new HttpServer();
  const fp = path.join(testInfo.outputDir, 'artifact.xyzfoo');
  fs.mkdirSync(testInfo.outputDir, { recursive: true });
  fs.writeFileSync(fp, 'mystery-content-98765');

  srv.routePath('/artifact.xyzfoo', (rq, rs) => { srv.serveFile(rq, rs, fp); return true; });
  await srv.start({ host: '127.0.0.1' });
  try {
    const normal = await rawGet(`${srv.urlPrefix('precise')}/artifact.xyzfoo`);
    expect(normal.sc).toBe(200);
    expect(normal.rh['content-type']).toBe('application/octet-stream');

    const ranged = await rawGet(`${srv.urlPrefix('precise')}/artifact.xyzfoo`, { 'Range': 'bytes=0-6' });
    expect(ranged.sc).toBe(206);
    expect(ranged.rh['content-type']).toBe('application/octet-stream');
    expect(ranged.bd).toBe('mystery');
  } finally {
    await srv.stop();
  }
});
