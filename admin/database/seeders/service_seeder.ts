import Service from '#models/service'
import { DockerService } from '#services/docker_service'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { ModelAttributes } from '@adonisjs/lucid/types/model'
import env from '#start/env'

export default class ServiceSeeder extends BaseSeeder {
  // Use environment variable with fallback to production default
  private static NOMAD_STORAGE_ABS_PATH = env.get('NOMAD_STORAGE_PATH', '/opt/project-nomad/storage')
  private static DEFAULT_SERVICES: Omit<ModelAttributes<Service>, 'created_at' | 'updated_at' | 'metadata' | 'id'>[] = [
    {
      service_name: DockerService.KIWIX_SERVICE_NAME,
      friendly_name: 'Kiwix',
      description: 'Offline Wikipedia, eBooks, and more',
      icon: 'IconBooks',
      container_image: 'ghcr.io/kiwix/kiwix-serve:3.8.1',
      container_command: '*.zim --address=all',
      container_config: JSON.stringify({
        HostConfig: {
          RestartPolicy: { Name: 'unless-stopped' },
          Binds: [`${ServiceSeeder.NOMAD_STORAGE_ABS_PATH}/zim:/data`],
          PortBindings: { '8080/tcp': [{ HostPort: '8090' }] }
        },
        ExposedPorts: { '8080/tcp': {} }
      }),
      ui_location: '8090',
      installed: false,
      installation_status: 'idle',
      is_dependency_service: false,
      depends_on: null,
    },
    {
      service_name: DockerService.OLLAMA_SERVICE_NAME,
      friendly_name: 'Ollama',
      description: 'Run local LLMs (AI models) with ease on your own hardware',
      icon: 'IconRobot',
      container_image: 'ollama/ollama:latest',
      container_command: 'serve',
      container_config: JSON.stringify({
        HostConfig: {
          RestartPolicy: { Name: 'unless-stopped' },
          Binds: [`${ServiceSeeder.NOMAD_STORAGE_ABS_PATH}/ollama:/root/.ollama`],
          PortBindings: { '11434/tcp': [{ HostPort: '11434' }] }
        },
        ExposedPorts: { '11434/tcp': {} }
      }),
      ui_location: null,
      installed: false,
      installation_status: 'idle',
      is_dependency_service: true,
      depends_on: null,
    },
    {
      service_name: DockerService.OPEN_WEBUI_SERVICE_NAME,
      friendly_name: 'Open WebUI',
      description: 'A web interface for interacting with local AI models served by Ollama',
      icon: 'IconWand',
      container_image: 'ghcr.io/open-webui/open-webui:main',
      container_command: null,
      container_config: JSON.stringify({
        HostConfig: {
          RestartPolicy: { Name: 'unless-stopped' },
          NetworkMode: 'host',
          Binds: [`${ServiceSeeder.NOMAD_STORAGE_ABS_PATH}/open-webui:/app/backend/data`],
          PortBindings: { '8080/tcp': [{ HostPort: '3000' }] }
        },
        Env: ['WEBUI_AUTH=False', 'PORT=3000', 'OLLAMA_BASE_URL=http://127.0.0.1:11434']
      }),
      ui_location: '3000',
      installed: false,
      installation_status: 'idle',
      is_dependency_service: false,
      depends_on: DockerService.OLLAMA_SERVICE_NAME,
    },
    {
      service_name: DockerService.CYBERCHEF_SERVICE_NAME,
      friendly_name: 'CyberChef',
      description: 'The Cyber Swiss Army Knife - a web app for encryption, encoding, and data analysis',
      icon: 'IconChefHat',
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
      installation_status: 'idle',
      is_dependency_service: false,
      depends_on: null,
    },
    {
      service_name: DockerService.FLATNOTES_SERVICE_NAME,
      friendly_name: 'FlatNotes',
      description: 'A simple note-taking app that stores all files locally',
      icon: 'IconNotes',
      container_image: 'dullage/flatnotes:latest',
      container_command: null,
      container_config: JSON.stringify({
        HostConfig: {
          RestartPolicy: { Name: 'unless-stopped' },
          PortBindings: { '8080/tcp': [{ HostPort: '8200' }] },
          Binds: [`${ServiceSeeder.NOMAD_STORAGE_ABS_PATH}/flatnotes:/data`]
        },
        ExposedPorts: { '8080/tcp': {} },
        Env: ['FLATNOTES_AUTH_TYPE=none']
      }),
      ui_location: '8200',
      installed: false,
      installation_status: 'idle',
      is_dependency_service: false,
      depends_on: null,
    },
    {
      service_name: DockerService.KOLIBRI_SERVICE_NAME,
      friendly_name: 'Kolibri',
      description: 'An offline-first education platform for schools and learners',
      icon: 'IconSchool',
      container_image: 'treehouses/kolibri:latest',
      container_command: null,
      container_config: JSON.stringify({
        HostConfig: {
          RestartPolicy: { Name: 'unless-stopped' },
          PortBindings: { '8080/tcp': [{ HostPort: '8300' }] },
          Binds: [`${ServiceSeeder.NOMAD_STORAGE_ABS_PATH}/kolibri:/root/.kolibri`]
        },
        ExposedPorts: { '8080/tcp': {} },
      }),
      ui_location: '8300',
      installed: false,
      installation_status: 'idle',
      is_dependency_service: false,
      depends_on: null,
    }
  ]

  async run() {
    const existingServices = await Service.query().select('service_name')
    const existingServiceNames = new Set(existingServices.map(service => service.service_name))

    const newServices = ServiceSeeder.DEFAULT_SERVICES.filter(service => !existingServiceNames.has(service.service_name))

    await Service.createMany([...newServices])
  }
}