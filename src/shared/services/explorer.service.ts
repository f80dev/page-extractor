import { Injectable, signal } from '@angular/core';
import type { ExplorationConfig } from '../models/exploration-config.model';
import { DEFAULT_EXPLORATION_CONFIG } from '../models/exploration-config.model';

export interface ExplorationProgress {
  isActive: boolean;
  exploredCount: number;
  totalToExplore: number;
  currentUrl: string;
  currentDepth: number;
  successfulPages: number;
  failedPages: number;
}

@Injectable({ providedIn: 'root' })
export class ExplorerService {
  // Signals for reactive UI
  isExploring = signal(false);
  progress = signal<ExplorationProgress>({
    isActive: false,
    exploredCount: 0,
    totalToExplore: 0,
    currentUrl: '',
    currentDepth: 0,
    successfulPages: 0,
    failedPages: 0
  });

  async startExploration(startUrl: string, config: Partial<ExplorationConfig> = {}): Promise<void> {
    const finalConfig = { ...DEFAULT_EXPLORATION_CONFIG, ...config };

    this.isExploring.set(true);
    this.progress.update(p => ({
      ...p,
      isActive: true,
      exploredCount: 0,
      totalToExplore: 1,
      currentUrl: startUrl,
      currentDepth: 0
    }));

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'START_EXPLORATION', url: startUrl },
        (response: any) => {
          if (response?.success) {
            resolve();
          } else {
            reject(new Error(response?.error || 'Failed to start exploration'));
          }
        }
      );
    });
  }

  async stopExploration(): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'STOP_EXPLORATION' },
        (response: any) => {
          this.isExploring.set(false);
          this.progress.update(p => ({ ...p, isActive: false }));
          if (response?.success) {
            resolve();
          } else {
            reject(new Error(response?.error || 'Failed to stop exploration'));
          }
        }
      );
    });
  }

  async getStatus(): Promise<ExplorationProgress> {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'GET_EXPLORATION_STATUS' },
        (response: any) => {
          const progress = {
            isActive: response?.isActive || false,
            exploredCount: response?.totalExplored || 0,
            totalToExplore: response?.total || 0,
            currentUrl: response?.currentUrl || '',
            currentDepth: response?.depth || 0,
            successfulPages: response?.stats?.successfulPages || 0,
            failedPages: response?.stats?.failedPages || 0
          };
          this.progress.set(progress);
          resolve(progress);
        }
      );
    });
  }

  updateProgress(update: Partial<ExplorationProgress>) {
    this.progress.update(p => ({ ...p, ...update }));
  }

  async discoverLinks(tabId: number, config: Partial<ExplorationConfig> = {}): Promise<any[]> {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(
        tabId,
        { type: 'FIND_LINKS', payload: config },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response?.links || []);
          }
        }
      );
    });
  }
}