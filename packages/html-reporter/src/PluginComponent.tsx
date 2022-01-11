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
import { ComponentProps, Components } from '@playwright/test/src/reporters/html';
import { TestAttachment } from '@playwright/test/src/reporters/html';

import * as React from 'react';
import { useCallback, useState } from 'react';

interface System {
  components: Components,
  mount: <T extends keyof ComponentProps>(name: T, props: ComponentProps[T], root: Element) => () => void;
}

const getSystem = () => {
  try {
    return (window as any).PlaywrightPlugins['default'] as System;
  } catch (_) {
    return;
  }
};

export const pluginRenderAttachment = (a: TestAttachment) => {
  const render = getSystem()?.components?.renderAttachment;
  return render ? render(a) : null;
};

export function PluginComponent<T extends keyof ComponentProps>({ name, props }: {name: T, props: ComponentProps[T]}) {
  const system = getSystem();
  if (system && system.components[name]) return <PluginComponentImpl name={name} props={props} />;
  return null;
}

function PluginComponentImpl<T extends keyof ComponentProps>({ name, props }: {name: T, props: ComponentProps[T]}) {
  const system = getSystem()!;
  const [dismount, setDismount] = useState<null|(() => void)>(null);
  const onRefChange = useCallback((root: HTMLDivElement) => {
    if (dismount) dismount();
    if (root !== null) {
      const dismount = system.mount(name, props, root);
      setDismount(() => () => dismount());
    }
  }, [name, props]);

  return <div ref={onRefChange}></div>;
}
