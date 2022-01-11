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
import { Components } from '@playwright/test/src/reporters/html';

const Header: Components['Header'] = props => {
  return <div>
    <h1>Playwright Test Report</h1>
    <dl>
      <dt>Start Time</dt>
      <dd><pre>{process.env.PLAYWRIGHT_REPORT_ENV_START_TIME}</pre></dd>

      <dt>Duration</dt>
      <dd><pre>{props?.stats?.duration || '-'} ms</pre></dd>

      <dt>Commit Author</dt>
      <dd><pre>{process.env.PLAYWRIGHT_REPORT_ENV_COMMIT_AUTHOR}</pre></dd>

      <dt>Commit Message</dt>
      <dd><pre>{process.env.PLAYWRIGHT_REPORT_ENV_COMMIT_MESSAGE}</pre></dd>

      <dt>Commit Hash</dt>
      <dd><pre>{process.env.PLAYWRIGHT_REPORT_ENV_COMMIT_HASH}</pre></dd>

      <dt>CI/CD Link</dt>
      <dd><pre><a href={process.env.PLAYWRIGHT_REPORT_ENV_CI_CD_LINK}>{process.env.PLAYWRIGHT_REPORT_ENV_CI_CD_LINK}</a></pre></dd>

      <dt>Notes</dt>
      <dd><pre>{process.env.PLAYWRIGHT_REPORT_ENV_NOTES}</pre></dd>
    </dl>
  </div>;
};

export default Header;
