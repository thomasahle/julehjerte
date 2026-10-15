import { browser } from '$app/environment';
import { GA_MEASUREMENT_ID } from './config';

/**
 * Send an event to Google Analytics
 */
function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean>
) {
  if (!browser || !GA_MEASUREMENT_ID || typeof window.gtag !== 'function') return;

  window.gtag('event', eventName, params);
}

/**
 * Track when a heart is viewed (clicked from gallery)
 */
export function trackHeartView(heartId: string, heartName: string) {
  trackEvent('view_heart', {
    heart_id: heartId,
    heart_name: heartName,
  });
}

/**
 * A short random id shared by every event of one download, so hearts fetched
 * in the same PDF can be grouped again in the raw (BigQuery) rows. Nothing is
 * stored in the browser; the id lives only for the click.
 */
function newDownloadId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? uuid.slice(0, 8) : Math.random().toString(36).slice(2, 10);
}

/**
 * Track when a heart's PDF is downloaded on its own page
 */
export function trackHeartDownload(heartId: string, heartName: string) {
  trackEvent('download_heart', {
    heart_id: heartId,
    heart_name: heartName,
    download_id: newDownloadId(),
    download_count: 1,
  });
}

/**
 * Track when several hearts are downloaded as one PDF: one download_heart per
 * heart, so counts per template come straight from GA4 (an event parameter is
 * cut at 100 characters, which a joined id list exceeds after a few hearts),
 * plus one download_multi_hearts for the basket itself.
 */
export function trackMultiDownload(hearts: ReadonlyArray<{ id: string; name: string }>) {
  const downloadId = newDownloadId();
  for (const heart of hearts) {
    trackEvent('download_heart', {
      heart_id: heart.id,
      heart_name: heart.name,
      download_id: downloadId,
      download_count: hearts.length,
    });
  }
  trackEvent('download_multi_hearts', {
    download_id: downloadId,
    count: hearts.length,
  });
}

/**
 * Track when a heart is selected/deselected for multi-PDF
 */
export function trackHeartSelect(heartId: string, heartName: string, selected: boolean) {
  trackEvent('select_heart', {
    heart_id: heartId,
    heart_name: heartName,
    selected,
  });
}

/**
 * Track when a heart is shared
 */
export function trackHeartShare(heartId: string, heartName: string, method: 'native' | 'clipboard') {
  trackEvent('share_heart', {
    heart_id: heartId,
    heart_name: heartName,
    share_method: method,
  });
}

/**
 * Track when a heart is opened in the editor
 */
export function trackHeartEdit(heartId: string, heartName: string) {
  trackEvent('edit_heart', {
    heart_id: heartId,
    heart_name: heartName,
  });
}

/**
 * Track when a heart's tracing mode ("Tegn af fra skærmen") is opened
 */
export function trackHeartTrace(heartId: string, heartName: string) {
  trackEvent('trace_heart', {
    heart_id: heartId,
    heart_name: heartName,
  });
}

/**
 * Track when a new heart is created in the editor
 */
/**
 * Track an error event for debugging
 */
function trackError(
  errorType: string,
  details: Record<string, string | number | boolean> = {}
) {
  // Log to console for local debugging
  console.error(`[Error: ${errorType}]`, details);

  // Send to Google Analytics
  trackEvent('error', {
    error_type: errorType,
    ...details,
  });
}

/**
 * Track SVG parsing errors
 */
export function trackSvgParseError(
  filename: string,
  reason: string,
  pathCount?: number
) {
  trackError('svg_parse_error', {
    filename,
    reason,
    path_count: pathCount ?? 0,
  });
}

/**
 * Track heart loading errors
 */
export function trackHeartLoadError(heartId: string, reason: string) {
  trackError('heart_load_error', {
    heart_id: heartId,
    reason,
  });
}

/**
 * Track file import errors
 */
export function trackImportError(filename: string, reason: string) {
  trackError('import_error', {
    filename,
    reason,
  });
}

/**
 * Track PDF generation errors
 */
