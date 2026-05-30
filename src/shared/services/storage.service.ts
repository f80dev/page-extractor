import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly SYNC_KEYS = ['extensionConfig'] as const;
  private readonly LOCAL_KEYS = ['requestLogs', 'explorationState'] as const;

  // Signals for reactive state
  configLoaded = signal(false);

  async getConfig<T extends Record<string, any>>(defaultValues: T): Promise<T> {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['extensionConfig'], (result) => {
        if (result.extensionConfig) {
          resolve({ ...defaultValues, ...result.extensionConfig } as T);
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
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  async getLogs(): Promise<any[]> {
    return new Promise((resolve) => {
      chrome.storage.local.get(['requestLogs'], (result) => {
        resolve(result.requestLogs || []);
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
      chrome.storage.local.get(['explorationState'], (result) => {
        resolve(result.explorationState || null);
      });
    });
  }

  async saveExplorationState(state: any): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set({ explorationState: state }, resolve);
    });
  }
}