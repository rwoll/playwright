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
import { Components, TestAttachment } from '@playwright/test/src/reporters/html';

const renderAttachment: Components['renderAttachment'] = (attachment: TestAttachment) => {
  if (attachment.name === 'diagnostics' && attachment.contentType === 'application/json' && attachment.body) {
    const data = JSON.parse(attachment.body) as { productUrl: string; };
    return <div>
      <p>This test created the following product in the environment under test: <a href={data.productUrl}>{data.productUrl}</a></p>
    </div>;
  }
  return null;
};

export default renderAttachment;
