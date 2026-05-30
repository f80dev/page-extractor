export interface ExplorationConfig {
  explorationEnabled: boolean;
  maxDepth: number;
  linksPerPageLimit: number;
  excludeDomains: string[];
  onlySameDomain: boolean;
  followExternalLinks: boolean;
  explorationDelayMs: number;
  explorationDelayVarianceMs: number;
  maxTotalPages: number;
  clickSelectors: string[];
}

export const DEFAULT_EXPLORATION_CONFIG: ExplorationConfig = {
  explorationEnabled: false,
  maxDepth: 1,
  linksPerPageLimit: 10,
  excludeDomains: [],
  onlySameDomain: true,
  followExternalLinks: false,
  explorationDelayMs: 2000,
  explorationDelayVarianceMs: 500,
  maxTotalPages: 20,
  clickSelectors: ['a[href]']
};