import { debug } from 'playwright-core/lib/utilsBundle';
import { raceAgainstTimeout } from 'playwright-core/lib/utils/timeoutRunner';
import { launchProcess } from 'playwright-core/lib/utils/processLauncher';

import path from 'path';
import type { Reporter } from '../../types/testReporter';
import type { PlaywrightTestConfig, TestPlugin } from "../types";

export type LaunchPluginOptions = {
    isReady: () => Promise<boolean>;
    command: string;
    name?: string;
    timeout?: number;
    reuseExisting?: boolean;
    cwd?: string;
    env?: { [key: string]: string; };
};

export class LaunchPlugin implements TestPlugin {
    private _isReady: () => Promise<boolean>;
    private _killProcess?: () => Promise<void>;
    private _processExitedPromise!: Promise<any>;
    private _options: LaunchPluginOptions;
    private _reporter: Reporter;

    get name() {
        return this._options.name || 'playwright-launch-plugin';
    };

    constructor(options: LaunchPluginOptions, reporter: Reporter) {
        this._reporter = reporter;
        this._options = { ...options };
    }

    public async configure(config: PlaywrightTestConfig, configDir: string) {
        this._options.cwd = this._options.cwd ? path.resolve(configDir, this._options.cwd) : configDir;
    }

    public async setup() {
        try {
          await this._startProcess();
          await this._waitForProcess();
        } catch (error) {
          await this.teardown();
          throw error;
        }
      }

      public async teardown() {
        await this._killProcess?.();
      }

      private async _startProcess(): Promise<void> {
        let processExitedReject = (error: Error) => { };
        this._processExitedPromise = new Promise((_, reject) => processExitedReject = reject);

        const isAlreadyAvailable = await this._isAvailable();
        if (isAlreadyAvailable) {
          debugWebServer(`WebServer is already available`);
          if (this._config.reuseExistingServer)
            return;
          throw new Error(`${this._config.url ?? `http://localhost:${this._config.port}`} is already used, make sure that nothing is running on the port/url or set reuseExistingServer:true in config.webServer.`);
        }

        debugWebServer(`Starting WebServer process ${this._config.command}...`);
        const { launchedProcess, kill } = await launchProcess({
          command: this._options.command,
          env: {
            ...process.env,
            ...this._options.env,
          },
          cwd: this._options.cwd,
          stdio: 'stdin',
          shell: true,
          attemptToGracefullyClose: async () => {},
          log: () => {},
          onExit: code => processExitedReject(new Error(`Process from config.webServer was not able to start. Exit code: ${code}`)),
          tempDirectories: [],
        });
        this._killProcess = kill;

        debugWebServer(`Process started`);

        launchedProcess.stderr!.on('data', line => this._reporter.onStdErr?.('[WebServer] ' + line.toString()));
        launchedProcess.stdout!.on('data', line => {
          if (debugWebServer.enabled)
            this._reporter.onStdOut?.('[WebServer] ' + line.toString());
        });
      }

      private async _waitForProcess() {
        debugWebServer(`Waiting for availability...`);
        await this._waitForAvailability();
        debugWebServer(`WebServer available`);
      }

      private async _waitForAvailability() {
        const launchTimeout = this._config.timeout || 60 * 1000;
        const cancellationToken = { canceled: false };
        const { timedOut } = (await Promise.race([
          raceAgainstTimeout(() => waitFor(this._isAvailable, cancellationToken), launchTimeout),
          this._processExitedPromise,
        ]));
        cancellationToken.canceled = true;
        if (timedOut)
          throw new Error(`Timed out waiting ${launchTimeout}ms from config.webServer.`);
      }

}
