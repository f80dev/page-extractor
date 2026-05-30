import { Injectable, signal } from '@angular/core';
import type { ScrollConfig } from '../models/scroll-config.model';
import { DEFAULT_SCROLL_CONFIG } from '../models/scroll-config.model';

@Injectable({ providedIn: 'root' })
export class ScrollService {
  // Reactive state
  isScrolling = signal(false);
  scrollProgress = signal(0);
  scrollLog = signal<string[]>([]);

  addLog(message: string) {
    this.scrollLog.update(logs => [...logs.slice(-20), `[${new Date().toISOString()}] ${message}`]);
  }

  async executeScroll(tabId: number, config: Partial<ScrollConfig> = {}): Promise<void> {
    const finalConfig = { ...DEFAULT_SCROLL_CONFIG, ...config };
    this.isScrolling.set(true);
    this.scrollProgress.set(0);
    this.addLog('Starting scroll with config: ' + JSON.stringify(finalConfig));

    try {
      // Send scroll configuration to content script
      const response = await this.sendMessage(tabId, 'START_SCROLL', {
        config: finalConfig
      });

      this.addLog('Scroll command sent to page');
      this.scrollProgress.set(50);

      // Wait for scroll completion
      // In practice, we'd listen for the PAGE_SCROLL_COMPLETE message
      await this.waitForCompletion(30000); // 30s timeout

      this.scrollProgress.set(100);
      this.addLog('Scroll completed successfully');
    } catch (error: any) {
      this.addLog('Scroll error: ' + error.message);
      throw error;
    } finally {
      this.isScrolling.set(false);
    }
  }

  async stopScroll(tabId: number): Promise<void> {
    await this.sendMessage(tabId, 'STOP_SCROLL', {});
    this.isScrolling.set(false);
    this.addLog('Scroll stopped by user');
  }

  isHeadless(): boolean {
    // This check happens in the content script
    // But we can detect if we're in a context where webdriver might be true
    return false; // Placeholder - actual check is in content script
  }

  private sendMessage(tabId: number, type: string, payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { type, payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  private waitForCompletion(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Scroll completion timeout'));
      }, timeoutMs);

      // In a full implementation, we'd listen for chrome.runtime.onMessage
      // For now, we just resolve after a reasonable time
      setTimeout(() => {
        clearTimeout(timeout);
        resolve();
      }, timeoutMs * 0.8); // Use 80% of timeout as reasonable wait
    });
  }
}