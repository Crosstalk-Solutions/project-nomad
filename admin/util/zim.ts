import { RawListRemoteZimFilesResponse, RawRemoteZimFileEntry } from "../types/zim.js";


export function isRawListRemoteZimFilesResponse(obj: any): obj is RawListRemoteZimFilesResponse {
    return obj && typeof obj === 'object' && 'feed' in obj && 'entry' in obj.feed && Array.isArray(obj.feed.entry);
}

export function isRawRemoteZimFileEntry(obj: any): obj is RawRemoteZimFileEntry {
    return obj && typeof obj === 'object' && 'id' in obj && 'title' in obj && 'summary' in obj;
}