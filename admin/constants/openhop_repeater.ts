export const OPENHOP_REPEATER_IMAGE = 'openhop/openhop-repeater:v1.1.4'
export const OPENHOP_REPEATER_HOST_PORT = '8510'
export const OPENHOP_REPEATER_CONTAINER_PORT = '8000/tcp'
export const OPENHOP_REPEATER_USB_VOLUME = {
  host_path: '/dev',
  container_path: '/host/dev',
}

export function buildOpenHopRepeaterContainerConfig(storageRoot: string) {
  return {
    HostConfig: {
      RestartPolicy: { Name: 'unless-stopped' },
      PortBindings: {
        [OPENHOP_REPEATER_CONTAINER_PORT]: [{ HostPort: OPENHOP_REPEATER_HOST_PORT }],
      },
      Binds: [
        `${storageRoot}/openhop-repeater/config:/etc/openhop_repeater`,
        `${storageRoot}/openhop-repeater/data:/var/lib/openhop_repeater`,
        // Keep the host device tree at a separate path so the container's own /dev remains intact.
        // Cgroup rules below grant access only to Linux CDC ACM (166) and USB serial (188) devices.
        `${OPENHOP_REPEATER_USB_VOLUME.host_path}:${OPENHOP_REPEATER_USB_VOLUME.container_path}`,
      ],
      DeviceCgroupRules: ['c 166:* rwm', 'c 188:* rwm'],
    },
    ExposedPorts: { [OPENHOP_REPEATER_CONTAINER_PORT]: {} },
  }
}
