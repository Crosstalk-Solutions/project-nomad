import { describe, it, expect } from 'vitest'
import { assertNotPrivateUrl } from '#app/validators/common'

describe('assertNotPrivateUrl', () => {
  it('permite URL pública HTTPS', () => {
    // Cenário
    const url = 'https://example.com/file.zim'

    // Ação / Validação
    expect(() => assertNotPrivateUrl(url)).not.toThrow()
  })

  it('permite URL RFC1918 192.168.x.x (LAN appliance)', () => {
    // Cenário
    const url = 'http://192.168.1.100:8080/file.zim'

    // Ação / Validação
    expect(() => assertNotPrivateUrl(url)).not.toThrow()
  })

  it('permite URL RFC1918 10.x.x.x (LAN appliance)', () => {
    // Cenário
    const url = 'http://10.0.0.1/file.zim'

    // Ação / Validação
    expect(() => assertNotPrivateUrl(url)).not.toThrow()
  })

  it('bloqueia localhost', () => {
    // Cenário
    const url = 'http://localhost/file'

    // Ação / Validação
    expect(() => assertNotPrivateUrl(url)).toThrow()
  })

  it('bloqueia 127.0.0.1 (loopback)', () => {
    expect(() => assertNotPrivateUrl('http://127.0.0.1/file')).toThrow()
  })

  it('bloqueia 127.0.0.2 (loopback alternativo)', () => {
    expect(() => assertNotPrivateUrl('http://127.0.0.2/file')).toThrow()
  })

  it('bloqueia 0.0.0.0', () => {
    expect(() => assertNotPrivateUrl('http://0.0.0.0/file')).toThrow()
  })

  it('bloqueia endereço de metadados cloud 169.254.169.254', () => {
    expect(() => assertNotPrivateUrl('http://169.254.169.254/metadata')).toThrow()
  })

  it('bloqueia IPv6 loopback [::1]', () => {
    expect(() => assertNotPrivateUrl('http://[::1]/file')).toThrow()
  })
})
