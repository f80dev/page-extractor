export interface ScrollConfig {
  scrollEnabled: boolean;
  scrollIterations: number;
  scrollSpeedPxPerSec: number;
  scrollSpeedVariance: number;
  pauseBetweenScrollMs: number;
  pauseVarianceMs: number;
  returnToTop: boolean;
  scrollMaxDurationSec: number;
}

export const DEFAULT_SCROLL_CONFIG: ScrollConfig = {
  scrollEnabled: true,
  scrollIterations: 3,
  scrollSpeedPxPerSec: 1000,
  scrollSpeedVariance: 20,
  pauseBetweenScrollMs: 600,
  pauseVarianceMs: 200,
  returnToTop: true,
  scrollMaxDurationSec: 30
};