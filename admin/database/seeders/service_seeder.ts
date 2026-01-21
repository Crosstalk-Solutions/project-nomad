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
      friendly_name: 'Information Library',
      powered_by: 'Kiwix',
      display_order: 1,
      description: 'Offline access to Wikipedia, medical references, how-to guides, and encyclopedias',
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
      powered_by: null,
      display_order: 100, // Dependency service, not shown directly
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
      friendly_name: 'AI Assistant',
      powered_by: 'Open WebUI + Ollama',
      display_order: 3,
      description: 'Local AI chat that runs entirely on your hardware - no internet required',
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
      friendly_name: 'Data Tools',
      powered_by: 'CyberChef',
      display_order: 11,
      description: 'Swiss Army knife for data encoding, encryption, and analysis',
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
      friendly_name: 'Notes',
      powered_by: 'FlatNotes',
      display_order: 10,
      description: 'Simple note-taking app with local storage',
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
      friendly_name: 'Education Platform',
      powered_by: 'Kolibri',
      display_order: 2,
      description: 'Interactive learning platform with video courses and exercises',
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
    },
    {
      service_name: DockerService.BENCHMARK_SERVICE_NAME,
      friendly_name: 'System Benchmark',
      description: 'Measure your server performance and compare with the NOMAD community',
      icon: 'IconChartBar',
      container_image: 'severalnines/sysbench:latest',
      container_command: null,
      container_config: JSON.stringify({
        HostConfig: {
          AutoRemove: true,
          Binds: [`${ServiceSeeder.NOMAD_STORAGE_ABS_PATH}/benchmark:/tmp/benchmark`]
        },
        WorkingDir: '/tmp/benchmark',
      }),
      ui_location: null, // UI is integrated into Command Center
      installed: false,
      installation_status: 'idle',
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