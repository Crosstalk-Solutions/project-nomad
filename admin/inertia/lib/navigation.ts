

export function getServiceLink(ui_location: string): string {
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