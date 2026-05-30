import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class StorageService {
  configLoaded = signal(false);

  async getConfig<T extends Record<string, any>>(defaultValues: T): Promise<T> {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['extensionConfig'], (result: Record<string, unknown>) => {
        const cfg = result['extensionConfig'] as T | undefined;
        if (cfg) {
          resolve({ ...defaultValues, ...cfg });
        } else {
          resolve(defaultValues);
        }
        this.configLoaded.set(true);
      });
    });
  }

  async saveConfig<T extends Record<string, any>>(config: T): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.set({ extensionConfig: config }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(String(chrome.runtime.lastError)));
        } else {
          resolve();
        }
      });
    });
  }

  async getLogs(): Promise<any[]> {
    return new Promise((resolve) => {
      chrome.storage.local.get(['requestLogs'], (result: Record<string, unknown>) => {
        const logs = result['requestLogs'];
        resolve(Array.isArray(logs) ? logs : []);
      });
    });
  }

  async clearLogs(): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set({ requestLogs: [] }, resolve);
    });
  }

  async getExplorationState(): Promise<any> {
    return new Promise((resolve) => {
      chrome.storage.local.get(['explorationState'], (result: Record<string, unknown>) => {
        resolve(result['explorationState'] ?? null);
      });
    });
  }

  async saveExplorationState(state: any): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set({ explorationState: state }, resolve);
    });
  }
}