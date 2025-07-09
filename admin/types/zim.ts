export type ZimFilesEntry =
    {
        type: 'file'
        key: string;
        name: string;
    } | {
        type: 'directory';
        prefix: string;
        name: string;
    }

export type ListZimFilesResponse = {
    files: ZimFilesEntry[]
    next?: string
}

export type ListRemoteZimFilesResponse = {
    items: RemoteZimFileEntry[];
    has_more: boolean;
    total_count: number;
}

export type RawRemoteZimFileEntry = {
    id: string;
    title: string;
    updated: string;
    summary: string;
    language: string;
    name: string;
    flavour: string;
    category: string;
    tags: string;
    articleCount: number;
    mediaCount: number;
    link: Record<string, string>[];
    author: {
        name: string
    };
    publisher: {
        name: string;
    };
    'dc:issued': string;
}

export type RawListRemoteZimFilesResponse = {
    '?xml': string;
    feed: {
        id: string;
        link: string[];
        title: string;
        updated: string;
        totalResults: number;
        startIndex: number;
        itemsPerPage: number;
        entry: any[];
    }
}

export type RemoteZimFileEntry = {
    id: string;
    title: string;
    updated: string;
    summary: string;
    size_bytes: number;
    download_url: string;
    author: string;
    file_name: string;
}