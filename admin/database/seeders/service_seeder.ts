import Service from '#models/service'
import { DockerService } from '#services/docker_service'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { ModelAttributes } from '@adonisjs/lucid/types/model'

export default class ServiceSeeder extends BaseSeeder {
  private static DEFAULT_SERVICES: Omit<ModelAttributes<Service>, 'created_at' | 'updated_at' | 'metadata' | 'id'>[] = [
    {
      service_name: DockerService.KIWIX_SERVICE_NAME,
      container_image: 'ghcr.io/kiwix/kiwix-serve',
      container_command: '*.zim --address=0.0.0.0',
      container_config: JSON.stringify({
        HostConfig: {
          RestartPolicy: { Name: 'unless-stopped' },
          Binds: [`${DockerService.NOMAD_STORAGE_ABS_PATH}/zim:/data`],
          PortBindings: { '8080/tcp': [{ HostPort: '8090' }] }
        },
        ExposedPorts: { '8080/tcp': {} }
      }),
      ui_location: '8090',
      installed: false,
      is_dependency_service: false,
      depends_on: null,
    },
    {
      service_name: DockerService.OPENSTREETMAP_SERVICE_NAME,
      container_image: 'overv/openstreetmap-tile-server',
      container_command: 'run',
      container_config: JSON.stringify({
        HostConfig: {
          RestartPolicy: { Name: 'unless-stopped' },
          Binds: [
            `${DockerService.NOMAD_STORAGE_ABS_PATH}/osm/db:/data/database:rw`,
            `${DockerService.NOMAD_STORAGE_ABS_PATH}/osm/tiles:/data/tiles:rw`
          ],
          PortBindings: { '80/tcp': [{ HostPort: '9000' }] }
        }
      }),
      ui_location: '9000',
      installed: false,
      is_dependency_service: false,
      depends_on: null,
    },
    {
      service_name: DockerService.OLLAMA_SERVICE_NAME,
      container_image: 'ollama/ollama:latest',
      container_command: 'serve',
      container_config: JSON.stringify({
        HostConfig: {
          RestartPolicy: { Name: 'unless-stopped' },
          Binds: [`${DockerService.NOMAD_STORAGE_ABS_PATH}/ollama:/root/.ollama`],
          PortBindings: { '11434/tcp': [{ HostPort: '11434' }] }
        },
        ExposedPorts: { '11434/tcp': {} }
      }),
      ui_location: null,
      installed: false,
      is_dependency_service: true,
      depends_on: null,
    },
    {
      service_name: DockerService.OPEN_WEBUI_SERVICE_NAME,
      container_image: 'ghcr.io/open-webui/open-webui:main',
      container_command: null,
      container_config: JSON.stringify({
        HostConfig: {
          RestartPolicy: { Name: 'unless-stopped' },
          NetworkMode: 'host',
          Binds: [`${DockerService.NOMAD_STORAGE_ABS_PATH}/open-webui:/app/backend/data`]
        },
        Env: ['WEBUI_AUTH=False', 'PORT=3000', 'OLLAMA_BASE_URL=http://127.0.0.1:11434']
      }),
      ui_location: '3000',
      installed: false,
      is_dependency_service: false,
      depends_on: DockerService.OLLAMA_SERVICE_NAME,
    },
    {
      service_name: DockerService.CYBERCHEF_SERVICE_NAME,
      container_image: 'ghcr.io/gchq/cyberchef:latest',
      container_command: null,
      container_config: JSON.stringify({
        HostConfig: {
          RestartPolicy: { Name: 'unless-stopped' },
          PortBindings: { '80/tcp': [{ HostPort: '8100' }] }
        },
        ExposedPorts: { '80/tcp': {} }
      }),
      ui_location: '8100',
      installed: false,
      is_dependency_service: false,
      depends_on: null,
    },
    {
      service_name: DockerService.FLATNOTES_SERVICE_NAME,
      container_image: 'dullage/flatnotes:latest',
      container_command: null,
      container_config: JSON.stringify({
        HostConfig: {
          RestartPolicy: { Name: 'unless-stopped' },
          PortBindings: { '8080/tcp': [{ HostPort: '8200' }] },
          Binds: [`${DockerService.NOMAD_STORAGE_ABS_PATH}/flatnotes:/data`]
        },
        ExposedPorts: { '8080/tcp': {} },
        Env: ['FLATNOTES_AUTH_TYPE=none']
      }),
      ui_location: '8200',
      installed: false,
      is_dependency_service: false,
      depends_on: null,
    },
  ]

  async run() {
    const existingServices = await Service.query().select('service_name')
    const existingServiceNames = new Set(existingServices.map(service => service.service_name))

    const newServices = ServiceSeeder.DEFAULT_SERVICES.filter(service => !existingServiceNames.has(service.service_name))

    await Service.createMany([...newServices])
  }
}