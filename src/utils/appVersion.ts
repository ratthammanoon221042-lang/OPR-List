/** Version of the code running in this page (set at build time) */
export const APP_VERSION: string = __APP_VERSION__;

/**
 * The newest published version, read from version.json (never from cache), or null when it
 * cannot be read. A phone can keep an old tab alive for days, still running old code.
 */
export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const version = (data as { version?: unknown })?.version;
    return typeof version === 'string' && version ? version : null;
  } catch {
    return null;
  }
}

/** Reloads the page from the network (the query string makes browsers skip their cached copy) */
export function reloadWithNewVersion(version: string): void {
  window.location.replace(`${window.location.pathname}?v=${encodeURIComponent(version)}`);
}
