

export function getServiceLink(ui_location: string): string {
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
    // Otherwise, treat it as a path
    return `/${ui_location}`;
}