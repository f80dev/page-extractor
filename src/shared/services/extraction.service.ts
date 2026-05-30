import { Injectable, signal } from '@angular/core';
import type { PageContent } from '../models/page-content.model';
import { StorageService } from './storage.service';

@Injectable({ providedIn: 'root' })
export class ExtractionService {
  // Signals for reactive UI
  isExtracting = signal(false);
  lastExtractedUrl = signal<string | null>(null);
  lastError = signal<string | null>(null);
  scrollStatus = signal<'idle' | 'scrolling' | 'complete' | 'error'>('idle');

  constructor(private storage: StorageService) {}

  async triggerExtraction(tabId: number, url: string): Promise<PageContent> {
    this.isExtracting.set(true);
    this.lastError.set(null);
    this.scrollStatus.set('idle');

    try {
      // Check if scroll is needed first
      const config = await this.storage.getConfig({
        scrollEnabled: true
      } as any);

      if (config.scrollEnabled) {
        this.scrollStatus.set('scrolling');
        // Scroll command is sent via the service worker which communicates
        // with the content script
      }

      // The actual extraction happens in the content script
      // We just need to trigger the message and get the result
      const result = await this.sendToTab(tabId, 'START_EXTRACTION', { url });

      this.scrollStatus.set('complete');
      this.lastExtractedUrl.set(url);
      this.isExtracting.set(false);

      return result as PageContent;
    } catch (error: any) {
      this.scrollStatus.set('error');
      this.lastError.set(error.message);
      this.isExtracting.set(false);
      throw error;
    }
  }

  private sendToTab(tabId: number, command: string, payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { type: command, payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  async sendScrollCommand(tabId: number, config: any): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { type: 'START_SCROLL', payload: { config } }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }
}