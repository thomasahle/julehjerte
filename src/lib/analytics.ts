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

/** The two ends of a SvelteKit navigation, as far as page views care. */
interface NavigationEnds {
  /**
   * `url` is null on the not-found page GitHub Pages serves as 404.html: the
   * router hydrates it as an error with no "from" URL, whatever the types say.
   */
  from: { url: URL | null } | null;
  to: { url: URL | null } | null;
}

/**
 * Whether a client-side navigation is a new page for GA4. The stream's
 * enhanced-measurement "page changes based on browser history events" is off
 * (ticking a heart rewrites `?selected=` through the router, and each tick was
 * counted as a page view), so the root layout sends page_view itself — only
 * when the pathname changes. The first load (`from` is null) is the config
 * call's own page view; a search-only change (`?selected=`) or a hash jump
 * stays on the page; a step through history to another path is a new page.
 */
export function isPageViewNavigation({ from, to }: NavigationEnds): boolean {
  if (!from?.url || !to?.url) return false;
  return from.url.pathname !== to.url.pathname;
}

/**
 * Send the page_view for a client-side navigation (see isPageViewNavigation).
 * The referrer and landing parameters (full_referrer, referrer_host,
 * landing_page, ref_tag) are set on the config call, which makes gtag attach
 * them to every event of the page load, this one included; they describe how
 * the visit arrived and are deliberately not recomputed here. page_referrer is
 * the in-site page navigated from, as GA4's own history page views report it.
 */
export function trackPageView(url: URL, title: string, referrer?: URL) {
  const params: Record<string, string> = {
    page_location: `${url.origin}${url.pathname}${url.search}`,
    page_path: url.pathname,
    page_title: title,
  };
  if (referrer) params.page_referrer = `${referrer.origin}${referrer.pathname}${referrer.search}`;
  trackEvent('page_view', params);
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
 * Track the header's colourful mode ("Farverig") being turned on or off — by
 * its toggle, or off by picking a paper colour while it is on.
 */
export function trackColorMode(on: boolean) {
  trackEvent('color_mode', { on });
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
 * Track when a heart's laser file is downloaded from "Hent til laserskærer"
 * (docs/redesign/LASER.md): which format, at what width in millimetres.
 */
export function trackLaserDownload(heartId: string, heartName: string, format: 'svg' | 'dxf', widthMm: number) {
  trackEvent('download_laser', {
    heart_id: heartId,
    heart_name: heartName,
    format,
    width_mm: widthMm,
  });
}

/**
 * Track one laser file holding several hearts (docs/redesign/SELECTION.md):
 * one download_laser per heart, sharing a download_id as the PDF's
 * download_heart events do, so the hearts of one file can be grouped again.
 */
export function trackMultiLaserDownload(
  hearts: ReadonlyArray<{ id: string; name: string }>,
  format: 'svg' | 'dxf',
  widthMm: number
) {
  const downloadId = newDownloadId();
  for (const heart of hearts) {
    trackEvent('download_laser', {
      heart_id: heart.id,
      heart_name: heart.name,
      format,
      width_mm: widthMm,
      download_id: downloadId,
      download_count: hearts.length,
    });
  }
}

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

