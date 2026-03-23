import { test } from '@japa/runner'
import { SystemService } from '../../../app/services/system_service.js'
import { DockerService } from '../../../app/services/docker_service.js'
import axios from 'axios'

test.group('Services | SystemService (Mocked)', (group) => {
  let originalAxiosGet: any
  let originalAxiosPost: any

  group.each.setup(() => {
    // Save original Axios functions
    originalAxiosGet = axios.get
    originalAxiosPost = axios.post
  })

  group.each.teardown(() => {
    // Restore original functions
    axios.get = originalAxiosGet
    axios.post = originalAxiosPost
  })

  test('getInternetStatus: should return true if the request returns status 200', async ({ assert }) => {
    // Simulate Cloudflare URL (1.1.1.1) responding perfectly
    axios.get = async () => ({ status: 200 }) as any

    // Inject empty DockerService mock
    const mockDockerService = {} as DockerService
    const systemService = new SystemService(mockDockerService)

    const isOnline = await systemService.getInternetStatus()
    assert.isTrue(isOnline)
  })

  test('subscribeToReleaseNotes: should return success when the external API responds with 200', async ({ assert }) => {
    // Simulate projectnomad.us API returning success
    axios.post = async () => ({ status: 200 }) as any

    const systemService = new SystemService({} as DockerService)
    const response = await systemService.subscribeToReleaseNotes('jv@example.com')

    assert.isTrue(response.success)
    assert.equal(response.message, 'Successfully subscribed to release notes')
  })

  test('subscribeToReleaseNotes: should gracefully handle network failures', async ({ assert }) => {
    // Simulate network error
    axios.post = async () => { throw new Error('Network Error') }

    const systemService = new SystemService({} as DockerService)
    const response = await systemService.subscribeToReleaseNotes('jv@example.com')

    // The service should not crash, it should catch the error and return false
    assert.isFalse(response.success)
    assert.include(response.message, 'Failed to subscribe:')
  })
})