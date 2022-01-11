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

import colors from 'colors/safe';
import fs from 'fs';
import open from 'open';
import path from 'path';
import { Transform, TransformCallback } from 'stream';
import { FullConfig, Suite, Reporter } from '../../types/testReporter';
import { HttpServer } from 'playwright-core/lib/utils/httpServer';
import { calculateSha1, removeFolders } from 'playwright-core/lib/utils/utils';
import RawReporter, { JsonReport, JsonSuite, JsonTestCase, JsonTestResult, JsonTestStep } from './raw';
import assert from 'assert';
import yazl from 'yazl';
import { stripAnsiEscapes } from './base';
import os from 'os';
import { promisify } from 'util';
import rimraf from 'rimraf';
import { DefinePlugin, webpack } from 'webpack';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import BundleJsPlugin from './helpers/bundleJsPlugin';
const removeFolderAsync = promisify(rimraf);

// NB: This works for this very specific use case. It's far from optimized and has
// some non-intuitive behavior. DO NOT COPY :)
const copyFolderAsync = async (src: string, dst: string) => {
  await fs.promises.mkdir(dst, { recursive: true });
  for (const name of await fs.promises.readdir(src)) {
    const p = path.join(src, name);
    const stat = await fs.promises.stat(p);
    if (stat.isDirectory()) await copyFolderAsync(p, path.join(dst, name));
    else await fs.promises.copyFile(p, path.join(dst, name));
  }
};

export type Stats = {
  total: number;
  expected: number;
  unexpected: number;
  flaky: number;
  skipped: number;
  ok: boolean;
  duration: number;
};

export type Location = {
  file: string;
  line: number;
  column: number;
};

export type HTMLReport = {
  files: TestFileSummary[];
  stats: Stats;
  projectNames: string[];
};

export type TestFile = {
  fileId: string;
  fileName: string;
  tests: TestCase[];
  hooks: TestCase[];
};

export type TestFileSummary = {
  fileId: string;
  fileName: string;
  tests: TestCaseSummary[];
  hooks: TestCaseSummary[];
  stats: Stats;
};

export type TestCaseSummary = {
  testId: string,
  title: string;
  path: string[];
  projectName: string;
  location: Location;
  annotations: { type: string, description?: string }[];
  outcome: 'skipped' | 'expected' | 'unexpected' | 'flaky';
  duration: number;
  ok: boolean;
};

export type TestCase = TestCaseSummary & {
  results: TestResult[];
};

export type TestAttachment = {
  name: string;
  body?: string;
  path?: string;
  contentType: string;
};


export type TestResult = {
  retry: number;
  startTime: string;
  duration: number;
  steps: TestStep[];
  error?: string;
  attachments: TestAttachment[];
  status: 'passed' | 'failed' | 'timedOut' | 'skipped';
};

export type TestStep = {
  title: string;
  startTime: string;
  duration: number;
  location?: Location;
  snippet?: string;
  error?: string;
  steps: TestStep[];
  count: number;
};

type TestEntry = {
  testCase: TestCase;
  testCaseSummary: TestCaseSummary
};

export interface ComponentProps {
  Header: HTMLReport | undefined;
}

export type CreateComponent<T> = {
  [P in keyof T]: (props: T[P]) => JSX.Element
};

export type Components = Partial<CreateComponent<ComponentProps> & { renderAttachment: (attachment: TestAttachment) => JSX.Element | null; }>;


const kMissingContentType = 'x-playwright/missing';

class HtmlReporter implements Reporter {
  private config!: FullConfig;
  private suite!: Suite;
  private _outputFolder: string | undefined;
  private _open: 'always' | 'never' | 'on-failure';

  constructor(options: { outputFolder?: string, open?: 'always' | 'never' | 'on-failure' } = {}) {
    // TODO: resolve relative to config.
    this._outputFolder = options.outputFolder;
    this._open = options.open || 'on-failure';
  }

  printsToStdio() {
    return false;
  }

  onBegin(config: FullConfig, suite: Suite) {
    this.config = config;
    this.suite = suite;
  }

  async onEnd() {
    const projectSuites = this.suite.suites;
    const reports = projectSuites.map(suite => {
      const rawReporter = new RawReporter();
      const report = rawReporter.generateProjectReport(this.config, suite);
      return report;
    });
    const reportFolder = htmlReportFolder(this._outputFolder);
    await removeFolders([reportFolder]);
    const builder = new HtmlBuilder(reportFolder, this.config);
    const { ok, singleTestId } = await builder.build(reports);

    if (process.env.PWTEST_SKIP_TEST_OUTPUT || process.env.CI)
      return;

    const shouldOpen = this._open === 'always' || (!ok && this._open === 'on-failure');
    if (shouldOpen) {
      await showHTMLReport(reportFolder, singleTestId);
    } else {
      const outputFolderPath = htmlReportFolder(this._outputFolder) === defaultReportFolder() ? '' : ' ' + path.relative(process.cwd(), htmlReportFolder(this._outputFolder));
      console.log('');
      console.log('To open last HTML report run:');
      console.log(colors.cyan(`
  npx playwright show-report${outputFolderPath}
`));
    }
  }
}

export function htmlReportFolder(outputFolder?: string): string {
  if (process.env[`PLAYWRIGHT_HTML_REPORT`])
    return path.resolve(process.cwd(), process.env[`PLAYWRIGHT_HTML_REPORT`]);
  if (outputFolder)
    return outputFolder;
  return defaultReportFolder();
}

function defaultReportFolder(): string {
  return path.resolve(process.cwd(), 'playwright-report');
}

export async function showHTMLReport(reportFolder: string | undefined, testId?: string) {
  const folder = reportFolder || htmlReportFolder();
  try {
    assert(fs.statSync(folder).isDirectory());
  } catch (e) {
    console.log(colors.red(`No report found at "${folder}"`));
    process.exit(1);
    return;
  }
  const server = startHtmlReportServer(folder);
  let url = await server.start(9323);
  console.log('');
  console.log(colors.cyan(`  Serving HTML report at ${url}. Press Ctrl+C to quit.`));
  if (testId)
    url += `#?testId=${testId}`;
  open(url);
  await new Promise(() => {});
}

export function startHtmlReportServer(folder: string): HttpServer {
  const server = new HttpServer();
  server.routePrefix('/', (request, response) => {
    let relativePath = new URL('http://localhost' + request.url).pathname;
    if (relativePath.startsWith('/trace/file')) {
      const url = new URL('http://localhost' + request.url!);
      try {
        return server.serveFile(request, response, url.searchParams.get('path')!);
      } catch (e) {
        return false;
      }
    }
    if (relativePath === '/')
      relativePath = '/index.html';
    const absolutePath = path.join(folder, ...relativePath.split('/'));
    return server.serveFile(request, response, absolutePath);
  });
  return server;
}

class HtmlBuilder {
  private _reportFolder: string;
  private _tests = new Map<string, JsonTestCase>();
  private _testPath = new Map<string, string[]>();
  private _dataZipFile: yazl.ZipFile;
  private _hasTraces = false;
  private _playwrightConfig: FullConfig;

  constructor(outputDir: string, playwrightConfig: FullConfig) {
    this._reportFolder = path.resolve(process.cwd(), outputDir);
    this._playwrightConfig = playwrightConfig;
    fs.mkdirSync(this._reportFolder, { recursive: true });
    this._dataZipFile = new yazl.ZipFile();
  }

  async build(rawReports: JsonReport[]): Promise<{ ok: boolean, singleTestId: string | undefined }> {

    const data = new Map<string, { testFile: TestFile, testFileSummary: TestFileSummary }>();
    for (const projectJson of rawReports) {
      for (const file of projectJson.suites) {
        const fileName = file.location!.file;
        const fileId = file.fileId;
        let fileEntry = data.get(fileId);
        if (!fileEntry) {
          fileEntry = {
            testFile: { fileId, fileName, tests: [], hooks: [] },
            testFileSummary: { fileId, fileName, tests: [], hooks: [], stats: emptyStats() },
          };
          data.set(fileId, fileEntry);
        }
        const { testFile, testFileSummary } = fileEntry;
        const testEntries: TestEntry[] = [];
        const hookEntries: TestEntry[] = [];
        this._processJsonSuite(file, fileId, projectJson.project.name, [], testEntries, hookEntries);
        for (const test of testEntries) {
          testFile.tests.push(test.testCase);
          testFileSummary.tests.push(test.testCaseSummary);
        }
        for (const hook of hookEntries) {
          testFile.hooks.push(hook.testCase);
          testFileSummary.hooks.push(hook.testCaseSummary);
        }
      }
    }

    let ok = true;
    for (const [fileId, { testFile, testFileSummary }] of data) {
      const stats = testFileSummary.stats;
      for (const test of testFileSummary.tests) {
        if (test.outcome === 'expected')
          ++stats.expected;
        if (test.outcome === 'skipped')
          ++stats.skipped;
        if (test.outcome === 'unexpected')
          ++stats.unexpected;
        if (test.outcome === 'flaky')
          ++stats.flaky;
        ++stats.total;
        stats.duration += test.duration;
      }
      stats.ok = stats.unexpected + stats.flaky === 0;
      if (!stats.ok)
        ok = false;

      const testCaseSummaryComparator = (t1: TestCaseSummary, t2: TestCaseSummary) => {
        const w1 = (t1.outcome === 'unexpected' ? 1000 : 0) +  (t1.outcome === 'flaky' ? 1 : 0);
        const w2 = (t2.outcome === 'unexpected' ? 1000 : 0) +  (t2.outcome === 'flaky' ? 1 : 0);
        if (w2 - w1)
          return w2 - w1;
        return t1.location.line - t2.location.line;
      };
      testFileSummary.tests.sort(testCaseSummaryComparator);
      testFileSummary.hooks.sort(testCaseSummaryComparator);

      this._addDataFile(fileId + '.json', testFile);
    }
    const htmlReport: HTMLReport = {
      files: [...data.values()].map(e => e.testFileSummary),
      projectNames: rawReports.map(r => r.project.name),
      stats: [...data.values()].reduce((a, e) => addStats(a, e.testFileSummary.stats), emptyStats())
    };
    htmlReport.files.sort((f1, f2) => {
      const w1 = f1.stats.unexpected * 1000 + f1.stats.flaky;
      const w2 = f2.stats.unexpected * 1000 + f2.stats.flaky;
      return w2 - w1;
    });

    this._addDataFile('report.json', htmlReport);

    // Copy app.
    const appFolder = path.join(require.resolve('playwright-core'), '..', 'lib', 'webpack', 'htmlReport');
    fs.copyFileSync(path.join(appFolder, 'index.html'), path.join(this._reportFolder, 'index.html'));

    // Copy trace viewer.
    if (this._hasTraces) {
      const traceViewerFolder = path.join(require.resolve('playwright-core'), '..', 'lib', 'webpack', 'traceViewer');
      const traceViewerTargetFolder = path.join(this._reportFolder, 'trace');
      fs.mkdirSync(traceViewerTargetFolder, { recursive: true });
      for (const file of fs.readdirSync(traceViewerFolder)) {
        if (file.endsWith('.map'))
          continue;
        fs.copyFileSync(path.join(traceViewerFolder, file), path.join(traceViewerTargetFolder, file));
      }
    }

    // Inline report data.
    const indexFile = path.join(this._reportFolder, 'index.html');
    fs.appendFileSync(indexFile, '<script>\nwindow.playwrightReportBase64 = "data:application/zip;base64,');
    await new Promise(f => {
      this._dataZipFile!.end(undefined, () => {
        this._dataZipFile!.outputStream
            .pipe(new Base64Encoder())
            .pipe(fs.createWriteStream(indexFile, { flags: 'a' })).on('close', f);
      });
    });
    fs.appendFileSync(indexFile, '";</script>');

    // Inline user-land plugins
    const pluginsDir = process.env['PLAYWRIGHT_HTML_REPORT_PLUGINS_DIRECTORY'];
    const nodeModules = process.env['PLAYWRIGHT_HTML_REPORT_PLUGINS_NODE_MODULES'] || path.resolve(path.join(this._playwrightConfig.rootDir, 'node_modules'));
    if (pluginsDir)
      await this.generateWithPlugins(pluginsDir, indexFile, nodeModules);


    let singleTestId: string | undefined;
    if (htmlReport.stats.total === 1) {
      const testFile: TestFile  = data.values().next().value.testFile;
      singleTestId = testFile.tests[0].testId;
    }

    return { ok, singleTestId };
  }

  private async generateWithPlugins(pluginsDir: string, indexFile: string, nodeModules: string) {
    const workspace = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'playwright-report-rendering-workspace-'));
    try {
      await copyFolderAsync(pluginsDir, path.join(workspace, 'plugins'));
      await fs.promises.writeFile(path.join(workspace, 'index.ts'), `
          import * as React from "react";
          import ReactDOM from "react-dom";
          const components = require("./plugins/index").default;
          export default {
            components,
            mount: (name: string, props: any, root: Element) => {
              console.log("mount called for ", name);
              ReactDOM.render(React.createElement(components[name], props), root);
              return () => {
                console.log("dismount called for ", name);
                ReactDOM.unmountComponentAtNode(root);
              };
            }
          };
        `);
      await fs.promises.copyFile(indexFile, path.join(workspace, 'index.html'));
      await new Promise<void>((res, rej) => webpack({
        dependencies: [nodeModules],
        mode: 'development',
        context: workspace,
        entry: {
          plugins: path.join(workspace, 'index.ts'),
        },
        resolve: {
          extensions: ['.ts', '.js', '.tsx', '.jsx'],
          modules: [nodeModules],
        },
        resolveLoader: {
          modules: [nodeModules],
        },
        devtool: 'source-map',
        output: {
          globalObject: 'self',
          library: 'PlaywrightPlugins',
          filename: '[name].bundle.js',
          path: path.resolve(path.join(workspace, 'build')),
        },
        module: {
          rules: [
            {
              test: /\.(j|t)sx?$/,
              loader: 'babel-loader',
              options: {
                presets: [
                  '@babel/preset-typescript',
                  ['@babel/preset-react', { 'runtime': 'automatic' }],
                ]
              },
              exclude: /node_modules/,
            },
            {
              test: /\.css$/,
              use: ['style-loader', 'css-loader'],
            },
          ]
        },
        plugins: [
          new DefinePlugin({
            'process.env': JSON.stringify(Object.fromEntries(Object.entries(process.env).filter(([n]) => n.startsWith('PLAYWRIGHT_REPORT_ENV')))),
          }),
          new HtmlWebpackPlugin({
            title: 'Playwright Test Report',
            template: path.join(workspace, 'index.html'),
            inject: true,
          }),
          new BundleJsPlugin(),
        ],
      }, async (err, stats) => {
        console.log('error', err);
        if (err)
          return rej(err);
        if (!stats)
          return rej('no stats');
        const info = stats.toJson();
        console.log('hasErrors', stats.hasErrors());
        console.log('STATS', JSON.stringify(info, null, '  '));
        if (stats.hasErrors())
          return rej(err);
        await fs.promises.rename(path.join(workspace, 'build', 'index.html'), indexFile);
        console.log('renamed to', indexFile);
        return res();
      })).catch(e => {
        console.log('error generating plugin based report.', e);
      });
    } finally {
      await removeFolderAsync(workspace);
    }
  }

  private _addDataFile(fileName: string, data: any) {
    this._dataZipFile.addBuffer(Buffer.from(JSON.stringify(data)), fileName);
  }

  private _processJsonSuite(suite: JsonSuite, fileId: string, projectName: string, path: string[], outTests: TestEntry[], outHooks: TestEntry[]) {
    const newPath = [...path, suite.title];
    suite.suites.map(s => this._processJsonSuite(s, fileId, projectName, newPath, outTests, outHooks));
    suite.tests.forEach(t => outTests.push(this._createTestEntry(t, projectName, newPath)));
    suite.hooks.forEach(t => outHooks.push(this._createTestEntry(t, projectName, newPath)));
  }

  private _createTestEntry(test: JsonTestCase, projectName: string, path: string[]): TestEntry {
    const duration = test.results.reduce((a, r) => a + r.duration, 0);
    this._tests.set(test.testId, test);
    const location = test.location;
    path = [...path.slice(1)];
    this._testPath.set(test.testId, path);

    return {
      testCase: {
        testId: test.testId,
        title: test.title,
        projectName,
        location,
        duration,
        annotations: test.annotations,
        outcome: test.outcome,
        path,
        results: test.results.map(r => this._createTestResult(r)),
        ok: test.outcome === 'expected' || test.outcome === 'flaky',
      },
      testCaseSummary: {
        testId: test.testId,
        title: test.title,
        projectName,
        location,
        duration,
        annotations: test.annotations,
        outcome: test.outcome,
        path,
        ok: test.outcome === 'expected' || test.outcome === 'flaky',
      },
    };
  }

  private _createTestResult(result: JsonTestResult): TestResult {
    let lastAttachment: TestAttachment | undefined;
    return {
      duration: result.duration,
      startTime: result.startTime,
      retry: result.retry,
      steps: result.steps.map(s => this._createTestStep(s)),
      error: result.error,
      status: result.status,
      attachments: result.attachments.map(a => {
        if (a.name === 'trace')
          this._hasTraces = true;

        if ((a.name === 'stdout' || a.name === 'stderr') && a.contentType === 'text/plain') {
          if (lastAttachment &&
            lastAttachment.name === a.name &&
            lastAttachment.contentType === a.contentType) {
            lastAttachment.body += stripAnsiEscapes(a.body as string);
            return null;
          }
          a.body = stripAnsiEscapes(a.body as string);
          lastAttachment = a as TestAttachment;
          return a;
        }

        if (a.path) {
          let fileName = a.path;
          try {
            const buffer = fs.readFileSync(a.path);
            const sha1 = calculateSha1(buffer) + path.extname(a.path);
            fileName = 'data/' + sha1;
            fs.mkdirSync(path.join(this._reportFolder, 'data'), { recursive: true });
            fs.writeFileSync(path.join(this._reportFolder, 'data', sha1), buffer);
          } catch (e) {
            return {
              name: `Missing attachment "${a.name}"`,
              contentType: kMissingContentType,
              body: `Attachment file ${fileName} is missing`,
            };
          }
          return {
            name: a.name,
            contentType: a.contentType,
            path: fileName,
            body: a.body,
          };
        }

        if (a.body instanceof Buffer) {
          if (isTextContentType(a.contentType)) {
            // Content type is like this: "text/html; charset=UTF-8"
            const charset = a.contentType.match(/charset=(.*)/)?.[1];
            try {
              const body = a.body.toString(charset as any || 'utf-8');
              return {
                name: a.name,
                contentType: a.contentType,
                body,
              };
            } catch (e) {
              // Invalid encoding, fall through and save to file.
            }
          }

          fs.mkdirSync(path.join(this._reportFolder, 'data'), { recursive: true });
          const sha1 = calculateSha1(a.body) + '.dat';
          fs.writeFileSync(path.join(this._reportFolder, 'data', sha1), a.body);
          return {
            name: a.name,
            contentType: a.contentType,
            path: 'data/' + sha1,
            body: a.body,
          };
        }

        // string
        return {
          name: a.name,
          contentType: a.contentType,
          body: a.body,
        };
      }).filter(Boolean) as TestAttachment[]
    };
  }

  private _createTestStep(step: JsonTestStep): TestStep {
    return {
      title: step.title,
      startTime: step.startTime,
      duration: step.duration,
      snippet: step.snippet,
      steps: step.steps.map(s => this._createTestStep(s)),
      location: step.location,
      error: step.error,
      count: step.count
    };
  }
}

const emptyStats = (): Stats => {
  return {
    total: 0,
    expected: 0,
    unexpected: 0,
    flaky: 0,
    skipped: 0,
    ok: true,
    duration: 0,
  };
};

const addStats = (stats: Stats, delta: Stats): Stats => {
  stats.total += delta.total;
  stats.skipped += delta.skipped;
  stats.expected += delta.expected;
  stats.unexpected += delta.unexpected;
  stats.flaky += delta.flaky;
  stats.ok = stats.ok && delta.ok;
  stats.duration += delta.duration;
  return stats;
};

class Base64Encoder extends Transform {
  private _remainder: Buffer | undefined;

  override _transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback): void {
    if (this._remainder) {
      chunk = Buffer.concat([this._remainder, chunk]);
      this._remainder = undefined;
    }

    const remaining = chunk.length % 3;
    if (remaining) {
      this._remainder = chunk.slice(chunk.length - remaining);
      chunk = chunk.slice(0, chunk.length - remaining);
    }
    chunk = chunk.toString('base64');
    this.push(Buffer.from(chunk));
    callback();
  }

  override _flush(callback: TransformCallback): void {
    if (this._remainder)
      this.push(Buffer.from(this._remainder.toString('base64')));
    callback();
  }
}

function isTextContentType(contentType: string) {
  return contentType.startsWith('text/') || contentType.startsWith('application/json');
}

export default HtmlReporter;
