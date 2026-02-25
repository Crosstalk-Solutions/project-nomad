import KVStore from '#models/kv_store';
import { BenchmarkService } from '#services/benchmark_service';
import { MapService } from '#services/map_service';
import { OllamaService } from '#services/ollama_service';
import { SystemService } from '#services/system_service';
import { updateSettingSchema } from '#validators/settings';
import { inject } from '@adonisjs/core';
import type { HttpContext } from '@adonisjs/core/http'
import { parseBoolean } from '../utils/misc.js';

@inject()
export default class SettingsController {
    constructor(
        private systemService: SystemService,
        private mapService: MapService,
        private benchmarkService: BenchmarkService,
        private ollamaService: OllamaService
    ) { }

    async system({ inertia }: HttpContext) {
        const systemInfo = await this.systemService.getSystemInfo();
        return inertia.render('settings/system', {
            system: {
                info: systemInfo
            }
        });
    }

    async apps({ inertia }: HttpContext) {
        const services = await this.systemService.getServices({ installedOnly: false });
        return inertia.render('settings/apps', {
            system: {
                services
            }
        });
    }
    
    async legal({ inertia }: HttpContext) {
        return inertia.render('settings/legal');
    }

    async maps({ inertia }: HttpContext) {
        const baseAssetsCheck = await this.mapService.ensureBaseAssets();
        const regionFiles = await this.mapService.listRegions();
        return inertia.render('settings/maps', {
            maps: {
                baseAssetsExist: baseAssetsCheck,
                regionFiles: regionFiles.files
            }
        });
    }

    async models({ inertia }: HttpContext) {
        const availableModels = await this.ollamaService.getAvailableModels({ sort: 'pulls', recommendedOnly: false, query: null, limit: 15 });
        const installedModels = await this.ollamaService.getModels();
        const chatSuggestionsEnabled = await KVStore.getValue('chat.suggestionsEnabled')
        return inertia.render('settings/models', {
            models: {
                availableModels: availableModels?.models || [],
                installedModels: installedModels || [],
                settings: {
                    chatSuggestionsEnabled: parseBoolean(chatSuggestionsEnabled)
                }
            }
        });
    }

    async update({ inertia }: HttpContext) {
        const updateInfo = await this.systemService.checkLatestVersion();
        return inertia.render('settings/update', {
            system: {
                updateAvailable: updateInfo.updateAvailable,
                latestVersion: updateInfo.latestVersion,
                currentVersion: updateInfo.currentVersion
            }
        });
    }

    async zim({ inertia }: HttpContext) {
        return inertia.render('settings/zim/index')
    }

    async zimRemote({ inertia }: HttpContext) {
        return inertia.render('settings/zim/remote-explorer');
    }

    async benchmark({ inertia }: HttpContext) {
        const latestResult = await this.benchmarkService.getLatestResult();
        const status = this.benchmarkService.getStatus();
        return inertia.render('settings/benchmark', {
            benchmark: {
                latestResult,
                status: status.status,
                currentBenchmarkId: status.benchmarkId
            }
        });
    }

    async getSetting({ request, response }: HttpContext) {
        const key = request.qs().key;
        const value = await KVStore.getValue(key);
        return response.status(200).send({ key, value });
    }

    async updateSetting({ request, response }: HttpContext) {
        const reqData = await request.validateUsing(updateSettingSchema);
        await this.systemService.updateSetting(reqData.key, reqData.value);
        return response.status(200).send({ success: true, message: 'Setting updated successfully' });
    }
}