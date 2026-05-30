import { Injectable } from '@angular/core';
import type { PageContent } from '../models/page-content.model';
import { StorageService } from './storage.service';

export interface ApiResponse {
  status: number;
  statusText: string;
  body: any;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private storage: StorageService) {}

  async sendExtraction(payload: PageContent): Promise<ApiResponse> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'EXTRACT_SINGLE', url: payload.url },
        async (response: any) => {
          // The actual sending is done by the service worker
          // This just triggers the message
          if (response?.success) {
            resolve(response.result);
          } else {
            reject(new Error(response?.error || 'Extraction failed'));
          }
        }
      );
    });
  }

  async checkEndpointHealth(endpoint: string): Promise<boolean> {
    try {
      const response = await fetch(endpoint, {
        method: 'HEAD',
        mode: 'no-cors' // CORS might not be configured on the target
      });
      return true;
    } catch {
      return false;
    }
  }

  validateEndpointHttps(endpoint: string): boolean {
    try {
      const url = new URL(endpoint);
      return url.protocol === 'https:';
    } catch {
      return false;
    }
  }
}