import AdminAuthService from '#services/admin_auth_service'
import type { HttpContext } from '@adonisjs/core/http'

export default class AdminAuthController {
  async login({ request, response, session }: HttpContext) {
    const user = String(request.input('user', '')).trim()
    const password = String(request.input('password', ''))
    const redirectTo = this.safeRedirect(request.input('redirect'))

    if (!AdminAuthService.authenticate(user, password)) {
      session.flash('errors', {
        password: AdminAuthService.isConfigured()
          ? 'The admin user or password was incorrect.'
          : 'Admin login is not configured. Set ADMIN_USER and ADMIN_PASS in Docker Compose.',
      })
      return response.redirect().back()
    }

    await session.regenerate()
    session.put('admin.isLoggedIn', true)

    return response.redirect().toPath(redirectTo)
  }

  async logout({ response, session }: HttpContext) {
    session.forget('admin.isLoggedIn')
    await session.regenerate()

    return response.redirect().toPath('/home')
  }

  /**
   * Restrict redirects to local paths and keep auth routes from looping.
   */
  private safeRedirect(value: unknown): string {
    const redirectTo = typeof value === 'string' ? value : '/home'

    if (!redirectTo.startsWith('/') || redirectTo.startsWith('//')) {
      return '/home'
    }

    if (redirectTo.startsWith('/admin/login') || redirectTo.startsWith('/admin/logout')) {
      return '/home'
    }

    return redirectTo
  }
}
