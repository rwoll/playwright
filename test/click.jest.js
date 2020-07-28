/**
 * Copyright 2018 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
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

const utils = require('./utils');
const {FFOX, CHROMIUM, WEBKIT, HEADLESS, USES_HOOKS} = testOptions;

async function giveItAChanceToClick(page) {
  for (let i = 0; i < 5; i++)
    await page.evaluate(() => new Promise(f => requestAnimationFrame(() => requestAnimationFrame(f))));
}

describe('Page.click', function() {
  it('should click the button', async({page, server}) => {
    await page.goto(server.PREFIX + '/input/button.html');
    await page.click('button');
    expect(await page.evaluate(() => result)).toBe('Clicked');
  });
  it('should click and navigate to a x-frame-options:DENY link', async({page, server}) => {
    server.setRoute('/login-with-x-frame-options-deny.html', async (req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('X-Frame-Options', 'DENY');
      res.end();
    });

    server.setRoute('/wikipedia.html', async(req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(`
      <!DOCTYPE html>
      <html>
        <body>
          <a id="pt-login" href="/login-with-x-frame-options-deny.html">login</a>
        </body></html>
      `)
    })

    server.setRoute('/wrapper.html', async(req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(`
      <!DOCTYPE html>
      <html>
      <body>
          <div>
              <iframe src="${server.CROSS_PROCESS_PREFIX + '/wikipedia.html'}"  width="100%" height="100%" > </iframe>
          </div>
      </body></html>
      `)
    })

    await page.goto(server.PREFIX + '/wrapper.html')
    const navigated = new Promise(fulfull => {
      page.on('framenavigated', (frame) => {
        if (frame.url().endsWith('/login-with-x-frame-options-deny.html')) {
          fulfull(frame.url());
        }
      });
    });

    const consoleMessaged = new Promise(fulfill => {
      page.on('console', msg => {
        fulfill(msg.text());
      });
    });

    const frame = page.frames()[1];
    const button = await frame.$('#pt-login');
    await button.click();

    if (FFOX) {
      expect(await navigated).toBeTruthy();
    } else if (WEBKIT || CHROMIUM && HEADLESS) {
      expect((await consoleMessaged).match(/^Refused to display.*login-with-x-frame-options-deny\.html' in a frame because it set 'X-Frame-Options' to 'DENY'\./i)).toBeTruthy();
    } else if (CHROMIUM && !HEADLESS) {
      expect((await consoleMessaged).match(/^Failed to load resource: the server responded with a status of 404 \(Not Found\)/i)).toBeTruthy();
    }
  })
});
