
export type DockerComposeServiceConfig = {
    image: string;
    container_name: string;
    restart: string;
    ports: string[];
    environment?: Record<string, string>;
    volumes?: string[];
    networks?: string[];
}