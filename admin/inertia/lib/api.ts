import axios from "axios";
import { ListRemoteZimFilesResponse, ListZimFilesResponse, RemoteZimFileEntry } from "../../types/zim";

class API {
    private client;

    constructor() {
        this.client = axios.create({
            baseURL: "/api",
            headers: {
                "Content-Type": "application/json",
            },
        });
    }

    async listDocs() {
        try {
            const response = await this.client.get<Array<{ title: string; slug: string }>>("/docs/list");
            return response.data;
        } catch (error) {
            console.error("Error listing docs:", error);
            throw error;
        }
    }


    async installService(service_name: string) {
        try {
            const response = await this.client.post<{ success: boolean; message: string }>("/system/services/install", { service_name });
            return response.data;
        } catch (error) {
            console.error("Error installing service:", error);
            throw error;
        }
    }

    async listZimFiles() {
        return await this.client.get<ListZimFilesResponse>("/zim/list");
    }

    async listRemoteZimFiles({ start = 0, count = 12 }: { start?: number; count?: number }) {
        return await this.client.get<ListRemoteZimFilesResponse>("/zim/list-remote", {
            params: {
                start,
                count
            }
        });
    }

    async downloadRemoteZimFile(url: string) {
        try {
            const response = await this.client.post("/zim/download-remote", { url });
            return response.data;
        } catch (error) {
            console.error("Error downloading remote ZIM file:", error);
            throw error;
        }
    }

    async deleteZimFile(key: string) {
        try {
            const response = await this.client.delete(`/zim/${key}`);
            return response.data;
        } catch (error) {
            console.error("Error deleting ZIM file:", error);
            throw error;
        }
    }
}

export default new API();