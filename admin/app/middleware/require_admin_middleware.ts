import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export default class RequireAdminMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    if (ctx.session.get('admin.isLoggedIn')) {
      return next()
    }

    if (ctx.request.accepts(['html', 'json']) === 'json') {
      return ctx.response.status(403).send({
        success: false,
        message: 'Admin login is required.',
      })
    }

    const redirectTo = encodeURIComponent(ctx.request.url(true))
    return ctx.response.redirect().toPath(`/home?adminLogin=1&redirect=${redirectTo}`)
  }
}
