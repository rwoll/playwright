/**
 * Copyright 2017 Google Inc. All rights reserved.
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

import { EventEmitter } from 'events';
import * as types from './types';
import { Progress } from './progress';
import { debugLogger } from '../utils/debugLogger';

export type RegisteredListener = {
  emitter: EventEmitter;
  eventName: (string | symbol);
  handler: (...args: any[]) => void;
};

class Helper {
  static addEventListener(
    emitter: EventEmitter,
    eventName: (string | symbol),
    handler: (...args: any[]) => void): RegisteredListener {
    emitter.on(eventName, handler);
    return { emitter, eventName, handler };
  }

  static removeEventListeners(listeners: Array<{
      emitter: EventEmitter;
      eventName: (string | symbol);
      handler: (...args: any[]) => void;
    }>) {
    for (const listener of listeners)
      listener.emitter.removeListener(listener.eventName, listener.handler);
    listeners.splice(0, listeners.length);
  }

  static completeUserURL(urlString: string): string {
    if (urlString.startsWith('localhost') || urlString.startsWith('127.0.0.1'))
      urlString = 'http://' + urlString;
    return urlString;
  }

  static enclosingIntRect(rect: types.Rect): types.Rect {
    const x = Math.floor(rect.x + 1e-3);
    const y = Math.floor(rect.y + 1e-3);
    const x2 = Math.ceil(rect.x + rect.width - 1e-3);
    const y2 = Math.ceil(rect.y + rect.height - 1e-3);
    return { x, y, width: x2 - x, height: y2 - y };
  }

  static enclosingIntSize(size: types.Size): types.Size {
    return { width: Math.floor(size.width + 1e-3), height: Math.floor(size.height + 1e-3) };
  }

  static getViewportSizeFromWindowFeatures(features: string[]): types.Size | null {
    const widthString = features.find(f => f.startsWith('width='));
    const heightString = features.find(f => f.startsWith('height='));
    const width = widthString ? parseInt(widthString.substring(6), 10) : NaN;
    const height = heightString ? parseInt(heightString.substring(7), 10) : NaN;
    if (!Number.isNaN(width) && !Number.isNaN(height))
      return { width, height };
    return null;
  }

  static waitForEvent(progress: Progress | null, emitter: EventEmitter, event: string | symbol, predicate?: Function): { promise: Promise<any>, dispose: () => void } {
    const listeners: RegisteredListener[] = [];
    const promise = new Promise((resolve, reject) => {
      listeners.push(helper.addEventListener(emitter, event, eventArg => {
        try {
          if (predicate && !predicate(eventArg))
            return;
          helper.removeEventListeners(listeners);
          resolve(eventArg);
        } catch (e) {
          helper.removeEventListeners(listeners);
          reject(e);
        }
      }));
    });
    const dispose = () => helper.removeEventListeners(listeners);
    if (progress)
      progress.cleanupWhenAborted(dispose);
    return { promise, dispose };
  }

  static secondsToRoundishMillis(value: number): number {
    return ((value * 1000000) | 0) / 1000;
  }

  static millisToRoundishMillis(value: number): number {
    return ((value * 1000) | 0) / 1000;
  }

  static debugProtocolLogger(protocolLogger?: types.ProtocolLogger): types.ProtocolLogger {
    return (direction: 'send' | 'receive', message: object) => {
      if (protocolLogger)
        protocolLogger(direction, message);
      if (debugLogger.isEnabled('protocol'))
        debugLogger.log('protocol', (direction === 'send' ? 'SEND ► ' : '◀ RECV ') + JSON.stringify(message));
    };
  }

  static formatBrowserLogs(logs: string[]) {
    if (!logs.length)
      return '';
    return '\n' + '='.repeat(20) + ' Browser output: ' + '='.repeat(20) + '\n' + logs.join('\n');
  }

  /**
   * For use with WebKit Remote Addresses which look like:
   *
   * macOS:
   * ::1.8911
   * 2606:2800:220:1:248:1893:25c8:1946.443
   * 127.0.0.1:8000
   *
   * ubuntu:
   * ::1:8907
   * 127.0.0.1:8000
   *
   * NB: They look IPv4 and IPv6's with ports but use an alternative notation.
   */
  static parseRemoteAddress(value?: string) {
    if (!value)
      return;

    try {
      const colon = value.lastIndexOf(':');
      const dot = value.lastIndexOf('.');
      if (dot < 0) { // IPv6ish:port
        return {
          ipAddress: `[${value.slice(0, colon)}]`,
          port: +value.slice(colon + 1)
        };
      }

      if (colon > dot) { // IPv4:port
        const [address, port] = value.split(':');
        return {
          ipAddress: address,
          port: +port,
        };
      } else { // IPv6ish.port
        const [address, port] = value.split('.');
        return {
          ipAddress: `[${address}]`,
          port: +port,
        };
      }
    } catch (_) {}
  }
}

export const helper = Helper;
