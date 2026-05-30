import { Component, ChangeDetectionStrategy, signal, OnInit } from '@angular/core';
import { FormGroup, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { StorageService } from '../shared/services/storage.service';
import type { ScrollConfig } from '../shared/models/scroll-config.model';
import { DEFAULT_SCROLL_CONFIG } from '../shared/models/scroll-config.model';
import type { ExplorationConfig } from '../shared/models/exploration-config.model';
import { DEFAULT_EXPLORATION_CONFIG } from '../shared/models/exploration-config.model';

interface LogEntry {
  url: string;
  timestamp: string;
  depth: number;
  status: number;
  statusText: string;
  sizeBytes: number;
  durationMs: number;
}

interface ExtensionConfigForm {
  endpoint: string;
  authType: 'none' | 'bearer' | 'apikey';
  token: string;
  mainContentSelector: string;
  includeImages: boolean;
  includeLinks: boolean;
  includeTables: boolean;
}

@Component({
  selector: 'app-options',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatSliderModule,
    MatButtonModule,
    MatSnackBarModule,
    MatTableModule,
    MatIconModule,
    MatDividerModule,
    MatChipsModule,
    MatProgressBarModule
  ],
  template: `
    <div class="options-container">
      <header class="options-header">
        <span class="icon">📄</span>
        <div>
          <h1>Page Extractor — Options</h1>
          <p>Configurez le comportement de l'extension</p>
        </div>
      </header>

      <mat-tab-group animationDuration="200ms">

        <!-- Tab 1: Web Service -->
        <mat-tab label="Web Service">
          <div class="tab-content">
            <form [formGroup]="webServiceForm" (ngSubmit)="saveWebService()">
              <h2>Configuration du serveur</h2>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>URL de l'endpoint</mat-label>
                <input matInput formControlName="endpoint" type="url" placeholder="https://api.example.com/extraction" />
                @if (webServiceForm.get('endpoint')?.hasError('required')) {
                  <mat-error>URL requise</mat-error>
                }
                @if (webServiceForm.get('endpoint')?.hasError('notHttps')) {
                  <mat-error>L'URL doit être en HTTPS</mat-error>
                }
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Type d'authentification</mat-label>
                <mat-select formControlName="authType">
                  <mat-option value="none">Aucune</mat-option>
                  <mat-option value="bearer">Bearer Token</mat-option>
                  <mat-option value="apikey">API Key (header X-API-Key)</mat-option>
                </mat-select>
              </mat-form-field>

              @if (webServiceForm.get('authType')?.value !== 'none') {
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Token / Clé API</mat-label>
                  <input matInput formControlName="token" type="password" placeholder="••••••••••••" />
                  <mat-hint>Stocké de manière sécurisée</mat-hint>
                </mat-form-field>
              }

              <div class="form-actions">
                <button mat-raised-button color="primary" type="submit" [disabled]="!webServiceForm.valid">
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </mat-tab>

        <!-- Tab 2: Extraction -->
        <mat-tab label="Extraction">
          <div class="tab-content">
            <form [formGroup]="extractionForm" (ngSubmit)="saveExtraction()">
              <h2>Règles d'extraction</h2>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Sélecteur CSS de la zone principale</mat-label>
                <input matInput formControlName="mainContentSelector" placeholder="article, main, .content" />
                <mat-hint>Par défaut : article, puis main, puis body</mat-hint>
              </mat-form-field>

              <div class="toggle-group">
                <mat-slide-toggle formControlName="includeImages">
                  Inclure les images dans l'extraction
                </mat-slide-toggle>
                <mat-slide-toggle formControlName="includeLinks">
                  Inclure les liens dans l'extraction
                </mat-slide-toggle>
                <mat-slide-toggle formControlName="includeTables">
                  Inclure les tableaux dans l'extraction
                </mat-slide-toggle>
              </div>

              <div class="form-actions">
                <button mat-raised-button color="primary" type="submit">
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </mat-tab>

        <!-- Tab 3: Scroll -->
        <mat-tab label="Scroll">
          @defer {
            <div class="tab-content">
              <form [formGroup]="scrollForm" (ngSubmit)="saveScroll()">
                <h2>Scroll anti-bot</h2>

                <div class="headless-warning" [class.visible]="isHeadless()">
                  <mat-icon>warning</mat-icon>
                  <span>Mode headless détecté — le scroll sera automatiquement désactivé</span>
                </div>

                <mat-slide-toggle formControlName="scrollEnabled">
                  Activer le scroll intelligent
                </mat-slide-toggle>

                @if (scrollForm.get('scrollEnabled')?.value) {
                  <div class="scroll-config">
                    <div class="slider-field">
                      <label>Itérations de scroll : {{ scrollForm.get('scrollIterations')?.value }}</label>
                      <mat-slider min="1" max="10" step="1" discrete>
                        <input matSliderThumb formControlName="scrollIterations" />
                      </mat-slider>
                    </div>

                    <div class="slider-field">
                      <label>Vitesse (px/s) : {{ scrollForm.get('scrollSpeedPxPerSec')?.value }}</label>
                      <mat-slider min="300" max="3000" step="100">
                        <input matSliderThumb formControlName="scrollSpeedPxPerSec" />
                      </mat-slider>
                    </div>

                    <div class="slider-field">
                      <label>Variation de vitesse (%) : {{ scrollForm.get('scrollSpeedVariance')?.value }}</label>
                      <mat-slider min="0" max="50" step="5">
                        <input matSliderThumb formControlName="scrollSpeedVariance" />
                      </mat-slider>
                    </div>

                    <div class="slider-field">
                      <label>Pause entre scrolls (ms) : {{ scrollForm.get('pauseBetweenScrollMs')?.value }}</label>
                      <mat-slider min="100" max="3000" step="100">
                        <input matSliderThumb formControlName="pauseBetweenScrollMs" />
                      </mat-slider>
                    </div>

                    <div class="slider-field">
                      <label>Timeout global (s) : {{ scrollForm.get('scrollMaxDurationSec')?.value }}</label>
                      <mat-slider min="5" max="120" step="5">
                        <input matSliderThumb formControlName="scrollMaxDurationSec" />
                      </mat-slider>
                    </div>

                    <mat-slide-toggle formControlName="returnToTop">
                      Revenir en haut de page avant extraction
                    </mat-slide-toggle>
                  </div>
                }

                <div class="form-actions">
                  <button mat-raised-button color="primary" type="submit">
                    Enregistrer
                  </button>
                </div>
              </form>
            </div>
          } @loading {
            <div class="tab-content loading">
              <mat-progress-bar mode="indeterminate" />
            </div>
          }
        </mat-tab>

        <!-- Tab 4: Exploration -->
        <mat-tab label="Exploration">
          @defer {
            <div class="tab-content">
              <form [formGroup]="explorationForm" (ngSubmit)="saveExploration()">
                <h2>Exploration en profondeur</h2>

                <mat-slide-toggle formControlName="explorationEnabled">
                  Activer l'exploration récursive
                </mat-slide-toggle>

                @if (explorationForm.get('explorationEnabled')?.value) {
                  <div class="exploration-config">
                    <div class="slider-field">
                      <label>Profondeur max : {{ explorationForm.get('maxDepth')?.value }}</label>
                      <mat-slider min="0" max="5" step="1" discrete>
                        <input matSliderThumb formControlName="maxDepth" />
                      </mat-slider>
                    </div>

                    <div class="slider-field">
                      <label>Liens max par page : {{ explorationForm.get('linksPerPageLimit')?.value }}</label>
                      <mat-slider min="1" max="50" step="1" discrete>
                        <input matSliderThumb formControlName="linksPerPageLimit" />
                      </mat-slider>
                    </div>

                    <div class="slider-field">
                      <label>Pages max total : {{ explorationForm.get('maxTotalPages')?.value }}</label>
                      <mat-slider min="1" max="100" step="1" discrete>
                        <input matSliderThumb formControlName="maxTotalPages" />
                      </mat-slider>
                    </div>

                    <mat-slide-toggle formControlName="onlySameDomain">
                      Restreindre au même domaine
                    </mat-slide-toggle>

                    <mat-slide-toggle formControlName="followExternalLinks">
                      Suivre les liens externes (si désactivé, les ignorer)
                    </mat-slide-toggle>

                    <div class="slider-field">
                      <label>Délai entre pages (ms) : {{ explorationForm.get('explorationDelayMs')?.value }}</label>
                      <mat-slider min="500" max="10000" step="500">
                        <input matSliderThumb formControlName="explorationDelayMs" />
                      </mat-slider>
                    </div>

                    <mat-form-field appearance="outline" class="full-width">
                      <mat-label>Domaines à exclure (un par ligne)</mat-label>
                      <textarea matInput formControlName="excludeDomains" rows="3"
                        placeholder="facebook.com&#10;twitter.com&#10;linkedin.com"></textarea>
                    </mat-form-field>

                    <mat-form-field appearance="outline" class="full-width">
                      <mat-label>Sélecteurs de clic automatique (un par ligne)</mat-label>
                      <textarea matInput formControlName="clickSelectors" rows="3"
                        placeholder="a.related-article&#10;button[data-load-more]"></textarea>
                      <mat-hint>Déclenchera un clic sur ces sélecteurs avant extraction</mat-hint>
                    </mat-form-field>
                  </div>
                }

                <div class="form-actions">
                  <button mat-raised-button color="primary" type="submit">
                    Enregistrer
                  </button>
                </div>
              </form>
            </div>
          } @loading {
            <div class="tab-content loading">
              <mat-progress-bar mode="indeterminate" />
            </div>
          }
        </mat-tab>

        <!-- Tab 5: Log -->
        <mat-tab label="Log">
          @defer {
            <div class="tab-content">
              <div class="log-header">
                <h2>Historique des extractions</h2>
                <button mat-stroked-button (click)="clearLogs()">
                  <mat-icon>delete</mat-icon>
                  Effacer
                </button>
              </div>

              @if (logs().length === 0) {
                <div class="empty-state">
                  <mat-icon>inbox</mat-icon>
                  <p>Aucune extraction effectuée pour le moment</p>
                </div>
              } @else {
                <table mat-table [dataSource]="logs()" class="log-table">
                  <ng-container matColumnDef="timestamp">
                    <th mat-header-cell *matHeaderCellDef>Date</th>
                    <td mat-cell *matCellDef="let log">{{ formatDate(log.timestamp) }}</td>
                  </ng-container>

                  <ng-container matColumnDef="url">
                    <th mat-header-cell *matHeaderCellDef>URL</th>
                    <td mat-cell *matCellDef="let log" class="url-cell">
                      <span [title]="log.url">{{ truncate(log.url, 40) }}</span>
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="depth">
                    <th mat-header-cell *matHeaderCellDef>Prof.</th>
                    <td mat-cell *matCellDef="let log">{{ log.depth }}</td>
                  </ng-container>

                  <ng-container matColumnDef="status">
                    <th mat-header-cell *matHeaderCellDef>Statut</th>
                    <td mat-cell *matCellDef="let log">
                      <span class="status-badge" [class]="getStatusClass(log.status)">
                        {{ log.status }} {{ log.statusText }}
                      </span>
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="size">
                    <th mat-header-cell *matHeaderCellDef>Taille</th>
                    <td mat-cell *matCellDef="let log">{{ formatSize(log.sizeBytes) }}</td>
                  </ng-container>

                  <ng-container matColumnDef="duration">
                    <th mat-header-cell *matHeaderCellDef>Durée</th>
                    <td mat-cell *matCellDef="let log">{{ log.durationMs }}ms</td>
                  </ng-container>

                  <tr mat-header-row *matHeaderRowDef="logColumns"></tr>
                  <tr mat-row *matRowDef="let row; columns: logColumns;"></tr>
                </table>
              }
            </div>
          } @loading {
            <div class="tab-content loading">
              <mat-progress-bar mode="indeterminate" />
            </div>
          }
        </mat-tab>

      </mat-tab-group>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      background: #fafafa;
    }

    .options-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 24px;
    }

    .options-header {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 32px;

      .icon { font-size: 48px; }

      h1 { margin: 0; font-size: 24px; color: #333; }
      p { margin: 4px 0 0; color: #666; font-size: 14px; }
    }

    .tab-content {
      padding: 24px 0;

      h2 { margin: 0 0 20px; font-size: 18px; color: #333; }
    }

    .full-width { width: 100%; margin-bottom: 16px; }

    .toggle-group {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 24px;
    }

    .slider-field {
      margin-bottom: 16px;

      label { display: block; margin-bottom: 8px; font-size: 14px; color: #555; }
    }

    .scroll-config, .exploration-config {
      margin: 20px 0;
      padding: 16px;
      background: #f5f5f5;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .headless-warning {
      display: none;
      align-items: center;
      gap: 8px;
      padding: 12px;
      background: #fff3e0;
      border-radius: 8px;
      color: #e65100;
      font-size: 13px;
      margin-bottom: 16px;

      &.visible { display: flex; }
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #eee;
    }

    .log-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;

      h2 { margin: 0; }
    }

    .log-table {
      width: 100%;
      background: white;
      border-radius: 8px;
      overflow: hidden;

      .url-cell {
        font-family: monospace;
        font-size: 12px;
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .status-badge {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 10px;
        font-weight: 500;

        &.success { background: #e8f5e9; color: #2e7d32; }
        &.error { background: #ffebee; color: #c62828; }
        &.pending { background: #fff8e1; color: #f57f17; }
      }
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px;
      color: #999;

      mat-icon { font-size: 48px; width: 48px; height: 48px; }
      p { margin-top: 16px; }
    }

    .loading { padding: 48px; }
  `]
})
export class OptionsComponent implements OnInit {
  // Form definitions
  webServiceForm = new FormGroup({
    endpoint: new FormControl('', [Validators.required]),
    authType: new FormControl<'none' | 'bearer' | 'apikey'>('none'),
    token: new FormControl('')
  });

  extractionForm = new FormGroup({
    mainContentSelector: new FormControl('article, main'),
    includeImages: new FormControl(true),
    includeLinks: new FormControl(true),
    includeTables: new FormControl(true)
  });

  scrollForm = new FormGroup({
    scrollEnabled: new FormControl(true),
    scrollIterations: new FormControl(3),
    scrollSpeedPxPerSec: new FormControl(1000),
    scrollSpeedVariance: new FormControl(20),
    pauseBetweenScrollMs: new FormControl(600),
    pauseVarianceMs: new FormControl(200),
    returnToTop: new FormControl(true),
    scrollMaxDurationSec: new FormControl(30)
  });

  explorationForm = new FormGroup({
    explorationEnabled: new FormControl(false),
    maxDepth: new FormControl(1),
    linksPerPageLimit: new FormControl(10),
    excludeDomains: new FormControl(''),
    onlySameDomain: new FormControl(true),
    followExternalLinks: new FormControl(false),
    explorationDelayMs: new FormControl(2000),
    explorationDelayVarianceMs: new FormControl(500),
    maxTotalPages: new FormControl(20),
    clickSelectors: new FormControl('')
  });

  // State
  logs = signal<LogEntry[]>([]);
  isHeadless = signal(false);
  logColumns = ['timestamp', 'url', 'depth', 'status', 'size', 'duration'];

  constructor(
    private storage: StorageService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.loadConfig();
    this.loadLogs();
  }

  private async loadConfig() {
    // Load web service config
    const wsConfig = await this.storage.getConfig({
      endpoint: '',
      authType: 'none',
      token: ''
    } as any);
    this.webServiceForm.patchValue(wsConfig);

    // Load scroll config
    const scrollConfig = await this.storage.getConfig({
      scrollEnabled: true,
      scrollIterations: 3,
      scrollSpeedPxPerSec: 1000,
      scrollSpeedVariance: 20,
      pauseBetweenScrollMs: 600,
      pauseVarianceMs: 200,
      returnToTop: true,
      scrollMaxDurationSec: 30
    } as any);
    this.scrollForm.patchValue(scrollConfig);

    // Load exploration config
    const explConfig = await this.storage.getConfig({
      explorationEnabled: false,
      maxDepth: 1,
      linksPerPageLimit: 10,
      excludeDomains: '',
      onlySameDomain: true,
      followExternalLinks: false,
      explorationDelayMs: 2000,
      explorationDelayVarianceMs: 500,
      maxTotalPages: 20,
      clickSelectors: ''
    } as any);
    this.explorationForm.patchValue(explConfig);
  }

  private async loadLogs() {
    const logs = await this.storage.getLogs();
    this.logs.set(logs);
  }

  // Save methods
  async saveWebService() {
    if (!this.webServiceForm.valid) return;

    const endpoint = this.webServiceForm.get('endpoint')?.value || '';
    if (endpoint && !endpoint.startsWith('https://')) {
      this.webServiceForm.get('endpoint')?.setErrors({ notHttps: true });
      return;
    }

    try {
      const config = await this.storage.getConfig({} as any);
      await this.storage.saveConfig({
        ...config,
        ...this.webServiceForm.value
      } as any);
      this.snackBar.open('Configuration Web Service enregistrée', 'OK', { duration: 3000 });
    } catch (error: any) {
      this.snackBar.open(`Erreur : ${error.message}`, 'OK', { duration: 5000 });
    }
  }

  async saveExtraction() {
    try {
      const config = await this.storage.getConfig({} as any);
      await this.storage.saveConfig({
        ...config,
        ...this.extractionForm.value
      } as any);
      this.snackBar.open('Configuration Extraction enregistrée', 'OK', { duration: 3000 });
    } catch (error: any) {
      this.snackBar.open(`Erreur : ${error.message}`, 'OK', { duration: 5000 });
    }
  }

  async saveScroll() {
    try {
      const config = await this.storage.getConfig({} as any);
      await this.storage.saveConfig({
        ...config,
        ...this.scrollForm.value
      } as any);
      this.snackBar.open('Configuration Scroll enregistrée', 'OK', { duration: 3000 });
    } catch (error: any) {
      this.snackBar.open(`Erreur : ${error.message}`, 'OK', { duration: 5000 });
    }
  }

  async saveExploration() {
    try {
      const config = await this.storage.getConfig({} as any);
      const formValue = this.explorationForm.value;

      // Parse exclude domains from textarea
      const excludeDomains = (formValue.excludeDomains || '')
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      // Parse click selectors from textarea
      const clickSelectors = (formValue.clickSelectors || '')
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      await this.storage.saveConfig({
        ...config,
        ...formValue,
        excludeDomains,
        clickSelectors
      } as any);
      this.snackBar.open('Configuration Exploration enregistrée', 'OK', { duration: 3000 });
    } catch (error: any) {
      this.snackBar.open(`Erreur : ${error.message}`, 'OK', { duration: 5000 });
    }
  }

  async clearLogs() {
    await this.storage.clearLogs();
    this.logs.set([]);
    this.snackBar.open('Logs effacés', 'OK', { duration: 2000 });
  }

  // Utility methods
  formatDate(timestamp: string): string {
    try {
      const d = new Date(timestamp);
      return d.toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return timestamp;
    }
  }

  truncate(str: string, length: number): string {
    if (!str || str.length <= length) return str || '';
    return str.substring(0, length) + '…';
  }

  formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  getStatusClass(status: number): string {
    if (status >= 200 && status < 300) return 'success';
    if (status >= 400) return 'error';
    return 'pending';
  }
}