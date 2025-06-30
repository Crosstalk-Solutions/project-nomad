import axios from "axios";

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
            const response = await this.client.get<{ articles: Array<{ title: string; slug: string }> }>("/docs/list");
            return response.data.articles;
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
}

export default new API();