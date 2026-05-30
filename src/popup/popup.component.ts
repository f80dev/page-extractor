import { Component, ChangeDetectionStrategy, signal, computed, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackbar, MatSnackBar } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';

import { ExtractionService } from '../shared/services/extraction.service';
import { ExplorerService } from '../shared/services/explorer.service';
import { StorageService } from '../shared/services/storage.service';

@Component({
  selector: 'app-popup',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatSnackBar,
    MatIconModule,
    MatTooltipModule,
    MatMenuModule
  ],
  template: `
    <div class="popup-container">
      <header class="popup-header">
        <span class="logo">📄</span>
        <span class="title">Page Extractor</span>
      </header>

      <section class="page-info">
        <span class="url-label">Page actuelle :</span>
        <span class="url-value" [matTooltip]="currentUrl()">{{ truncatedUrl() }}</span>
      </section>

      @if (isLoading()) {
        <div class="loading-section">
          <mat-spinner diameter="28" />
          <span>{{ statusMessage() }}</span>
        </div>
      } @else {
        <div class="action-buttons">
          <button
            mat-raised-button
            color="primary"
            (click)="extractAndSend()"
            [disabled]="!currentUrl()"
          >
            Extraire & Envoyer
          </button>

          <button mat-icon-button [matMenuTriggerFor]="moreMenu" matTooltip="Plus d'options">
            <mat-icon>more_vert</mat-icon>
          </button>
          <mat-menu #moreMenu="matMenu">
            <button mat-menu-item (click)="extractOnly()">
              <mat-icon>article</mat-icon>
              <span>Extraire sans envoyer</span>
            </button>
            <button mat-menu-item (click)="exploreWithDepth()">
              <mat-icon>explore</mat-icon>
              <span>Explorer en profondeur</span>
            </button>
          </mat-menu>
        </div>
      }

      @if (explorationProgress().isActive) {
        <section class="exploration-section">
          <div class="exploration-header">
            <mat-icon>explore</mat-icon>
            <span>Exploration en cours</span>
          </div>

          <div class="progress-info">
            <span>{{ explorationProgress().exploredCount }} / {{ explorationProgress().totalToExplore }} pages</span>
            @if (explorationProgress().currentUrl) {
              <span class="current-url" [matTooltip]="explorationProgress().currentUrl">
                {{ truncate(explorationProgress().currentUrl, 40) }}
              </span>
            }
          </div>

          <mat-progress-bar
            [value]="progressPercent()"
            mode="determinate"
          />

          <div class="exploration-stats">
            <span class="success">✓ {{ explorationProgress().successfulPages }}</span>
            @if (explorationProgress().failedPages > 0) {
              <span class="failed">✗ {{ explorationProgress().failedPages }}</span>
            }
          </div>

          <button mat-stroked-button color="warn" (click)="stopExploration()">
            Arrêter l'exploration
          </button>
        </section>
      }

      <section class="last-status">
        <span class="status-label">Dernière action :</span>
        @if (lastStatus() === 'success') {
          <span class="status-chip success">
            <mat-icon>check_circle</mat-icon>
            Envoyé
          </span>
        } @else if (lastStatus() === 'error') {
          <span class="status-chip error">
            <mat-icon>error</mat-icon>
            Erreur
          </span>
        } @else {
          <span class="status-chip neutral">—</span>
        }
      </section>

      <footer class="popup-footer">
        <a href="/options" class="options-link">
          <mat-icon>settings</mat-icon>
          Options
        </a>
      </footer>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 320px;
      min-height: 400px;
      background: #fff;
      font-family: 'Segoe UI', system-ui, sans-serif;
    }

    .popup-container {
      display: flex;
      flex-direction: column;
      padding: 16px;
      gap: 16px;
    }

    .popup-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-bottom: 12px;
      border-bottom: 1px solid #eee;

      .logo { font-size: 24px; }
      .title { font-weight: 600; font-size: 16px; color: #333; }
    }

    .page-info {
      display: flex;
      flex-direction: column;
      gap: 4px;

      .url-label { font-size: 11px; color: #888; text-transform: uppercase; }
      .url-value {
        font-size: 13px;
        color: #555;
        font-family: 'Consolas', monospace;
        background: #f5f5f5;
        padding: 4px 8px;
        border-radius: 4px;
        max-width: 280px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        display: block;
      }
    }

    .loading-section {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: #f0f7ff;
      border-radius: 8px;

      span { font-size: 13px; color: #555; }
    }

    .action-buttons {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .exploration-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      background: #f5f5f5;
      border-radius: 8px;

      .exploration-header {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 500;
        font-size: 13px;
      }

      .progress-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-size: 12px;

        .current-url {
          color: #666;
          font-family: monospace;
          font-size: 11px;
        }
      }

      .exploration-stats {
        display: flex;
        gap: 12px;
        font-size: 12px;

        .success { color: #2e7d32; }
        .failed { color: #c62828; }
      }
    }

    .last-status {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-top: 8px;
      border-top: 1px solid #eee;

      .status-label { font-size: 12px; color: #888; }

      .status-chip {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        padding: 2px 8px;
        border-radius: 12px;

        &.success { background: #e8f5e9; color: #2e7d32; }
        &.error { background: #ffebee; color: #c62828; }
        &.neutral { background: #f5f5f5; color: #999; }

        mat-icon { font-size: 14px; width: 14px; height: 14px; }
      }
    }

    .popup-footer {
      display: flex;
      justify-content: flex-end;
      padding-top: 8px;

      .options-link {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        color: #666;
        text-decoration: none;

        &:hover { color: #333; }
      }
    }
  `]
})
export class PopupComponent implements OnInit {
  currentUrl = signal('');
  isLoading = signal(false);
  statusMessage = signal('');
  lastStatus = signal<'success' | 'error' | ''>('');
  explorationProgress = signal({
    isActive: false,
    exploredCount: 0,
    totalToExplore: 0,
    currentUrl: '',
    currentDepth: 0,
    successfulPages: 0,
    failedPages: 0
  });

  truncatedUrl = computed(() => this.truncate(this.currentUrl(), 45));

  progressPercent = computed(() => {
    const p = this.explorationProgress();
    if (p.totalToExplore === 0) return 0;
    return Math.round((p.exploredCount / p.totalToExplore) * 100);
  });

  constructor(
    private extractionService: ExtractionService,
    private explorerService: ExplorerService,
    private storage: StorageService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.loadCurrentTab();
    this.listenForUpdates();
  }

  private async loadCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url && !tab.url.startsWith('chrome://')) {
        this.currentUrl.set(tab.url);
      }
    } catch (e) {
      // Permission error or no tabs
    }
  }

  private listenForUpdates() {
    // Listen for messages from service worker
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'POPUP_UPDATE') {
        if (message.payload) {
          this.explorationProgress.set(message.payload);
        }
      }
    });
  }

  async extractAndSend() {
    if (!this.currentUrl()) return;

    this.isLoading.set(true);
    this.statusMessage.set('Extraction en cours…');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab');

      this.statusMessage.set('Envoi vers le serveur…');

      await new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: 'EXTRACT_SINGLE', url: this.currentUrl() },
          (response: any) => {
            if (response?.success) {
              resolve();
            } else {
              reject(new Error(response?.error || 'Extraction failed'));
            }
          }
        );
      });

      this.lastStatus.set('success');
      this.snackBar.open('Extraction envoyée avec succès', 'OK', { duration: 3000 });
    } catch (error: any) {
      this.lastStatus.set('error');
      this.snackBar.open(`Erreur : ${error.message}`, 'OK', { duration: 5000 });
    } finally {
      this.isLoading.set(false);
    }
  }

  async extractOnly() {
    this.snackBar.open('Fonctionnalité en cours de développement', 'OK', { duration: 2000 });
  }

  async exploreWithDepth() {
    if (!this.currentUrl()) return;

    try {
      await this.explorerService.startExploration(this.currentUrl());
      this.isLoading.set(true);
      this.statusMessage.set('Exploration en cours…');
    } catch (error: any) {
      this.snackBar.open(`Erreur : ${error.message}`, 'OK', { duration: 3000 });
    }
  }

  async stopExploration() {
    try {
      await this.explorerService.stopExploration();
      this.isLoading.set(false);
      this.snackBar.open('Exploration arrêtée', 'OK', { duration: 2000 });
    } catch (error: any) {
      this.snackBar.open(`Erreur : ${error.message}`, 'OK', { duration: 3000 });
    }
  }

  truncate(str: string, length: number): string {
    if (str.length <= length) return str;
    return str.substring(0, length) + '…';
  }
}