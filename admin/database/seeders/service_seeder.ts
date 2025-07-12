import Service from '#models/service'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { ModelAttributes } from '@adonisjs/lucid/types/model'

export default class ServiceSeeder extends BaseSeeder {
  private static DEFAULT_SERVICES: Omit<ModelAttributes<Service>, 'created_at' | 'updated_at' | 'metadata' | 'id'>[] = [
    {
      service_name: 'kiwix-serve',
      container_image: 'ghcr.io/kiwix/kiwix-serve',
      container_command: '*.zim --address=0.0.0.0',
      container_config: "{\"HostConfig\":{\"Binds\":[\"/opt/project-nomad/storage/zim:/data\"],\"PortBindings\":{\"8080/tcp\":[{\"HostPort\":\"8090\"}]}},\"ExposedPorts\":{\"8080/tcp\":{}}}",
      ui_location: '8090',
      installed: false,
      is_dependency_service: false,
      depends_on: null,
    },
    {
      service_name: 'openstreetmap',
      container_image: 'overv/openstreetmap-tile-server',
      container_command: 'run --shm-size="192m"',
      container_config: "{\"HostConfig\":{\"Binds\":[\"/opt/project-nomad/storage/osm/db:/data/database\",\"/opt/project-nomad/storage/osm/tiles:/data/tiles\"],\"PortBindings\":{\"80/tcp\":[{\"HostPort\":\"9000\"}]}}}",
      ui_location: '9000',
      installed: false,
      is_dependency_service: false,
      depends_on: null,
    },
    {
      service_name: 'ollama',
      container_image: 'ollama/ollama:latest',
      container_command: 'serve',
      container_config: "{\"HostConfig\":{\"Binds\":[\"/opt/project-nomad/storage/ollama:/root/.ollama\"],\"PortBindings\":{\"11434/tcp\":[{\"HostPort\":\"11434\"}]}}, \"ExposedPorts\":{\"11434/tcp\":{}}}",
      ui_location: null,
      installed: false,
      is_dependency_service: true,
      depends_on: null,
    },
    {
      service_name: 'open-webui',
      container_image: 'ghcr.io/open-webui/open-webui:main',
      container_command: null,
      container_config: "{\"HostConfig\":{\"NetworkMode\":\"host\",\"Binds\":[\"/opt/project-nomad/storage/open-webui:/app/backend/data\"]}}",
      ui_location: '3000',
      installed: false,
      is_dependency_service: false,
      depends_on: 'ollama',
    },
  ]

  async run() {
    const existingServices = await Service.query().select('service_name')
    const existingServiceNames = new Set(existingServices.map(service => service.service_name))

    const newServices = ServiceSeeder.DEFAULT_SERVICES.filter(service => !existingServiceNames.has(service.service_name))

    await Service.createMany([...newServices])
  }
}