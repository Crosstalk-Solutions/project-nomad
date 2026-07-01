
/**
 * Normalize a user-supplied custom app URL. Accepts a bare host ("jellyfin.lan",
 * "10.0.0.5:8096") or a full URL; when no scheme is present, http:// is prepended
 * (LAN resources are usually plain HTTP). Returns the normalized href, or null when
 * the input is empty (clears the override) or not a valid http(s) URL. Restricting to
 * http/https is the XSS guard — javascript:/data: URLs never make it into an href.
 */
export function normalizeCustomUrl(input: string | null | undefined): string | null {
    const trimmed = (input ?? '').trim();
    if (!trimmed) return null;
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    try {
        const url = new URL(withScheme);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        return url.href;
    } catch {
        return null;
    }
}

export function getServiceLink(ui_location: string, customUrl?: string | null): string {
    // A user-set custom URL (reverse proxy / local DNS) overrides the computed default. Only
    // accepted when it normalizes to a valid http(s) URL — otherwise fall through to the default.
    const normalizedCustom = normalizeCustomUrl(customUrl);
    if (normalizedCustom) {
        return normalizedCustom;
    }

    // "https:8480" / "http:8480" — an explicit scheme + port served on the current host. Checked
    // before the URL parse below because new URL("https:8480") would mis-parse 8480 as the host.
    const schemePort = ui_location.match(/^(https?):(\d+)$/);
    if (schemePort) {
        return `${schemePort[1]}://${window.location.hostname}:${schemePort[2]}`;
    }

    // Check if the ui location is a valid URL
    try {
        const url = new URL(ui_location);
        // If it is a valid URL, return it as is
        return url.href;
    } catch (e) {
        // If it fails, it means it's not a valid URL
    }

    // Check if the ui location is a port number
    const parsedPort = parseInt(ui_location, 10);
    if (!isNaN(parsedPort)) {
        // If it's a port number, return a link to the service on that port
        return `http://${window.location.hostname}:${parsedPort}`;
    }

    const pathPattern = /^\/.+/;
    if (pathPattern.test(ui_location)) {
        // If it starts with a slash, treat it as a full path
        return ui_location;
    }

    return `/${ui_location}`;
}