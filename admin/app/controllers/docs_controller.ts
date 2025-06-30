import { DocsService } from '#services/docs_service'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

@inject()
export default class DocsController {
    constructor(
        private docsService: DocsService
    ) { }

    async list({ }: HttpContext) {
        const docs = await this.docsService.getDocs();
        return { articles: docs };
    }

    async show({ params, inertia }: HttpContext) {
        const content = await this.docsService.parseFile(`${params.slug}.md`);
        return inertia.render('docs/show', {
            content,
            title: "Documentation"
        });
    }
}