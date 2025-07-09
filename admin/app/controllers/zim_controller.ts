import { ZimService } from '#services/zim_service';
import { inject } from '@adonisjs/core';
import type { HttpContext } from '@adonisjs/core/http'

@inject()
export default class ZimController {
    constructor(
        private zimService: ZimService
    ) { }

    async list({ }: HttpContext) {
        return await this.zimService.list();
    }

    async listRemote({ request }: HttpContext) {
        const { start = 0, count = 12 } = request.qs();
        return await this.zimService.listRemote({ start, count });
    }

    async downloadRemote({ request, response }: HttpContext) {
        const { url } = request.body()
        await this.zimService.downloadRemote(url);

        response.status(200).send({
            message: 'Download started successfully'
        });
    }

    async delete({ request, response }: HttpContext) {
        const { key } = request.params();

        try {
            await this.zimService.delete(key);
        } catch (error) {
            if (error.message === 'not_found') {
                return response.status(404).send({
                    message: `ZIM file with key ${key} not found`
                });
            }
            throw error; // Re-throw any other errors and let the global error handler catch
        }

        response.status(200).send({
            message: 'ZIM file deleted successfully'
        });
    }
}