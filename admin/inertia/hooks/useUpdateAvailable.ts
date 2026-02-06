import api from "~/lib/api"
import { CheckLatestVersionResult } from "../../types/system"
import { useQuery } from "@tanstack/react-query"


export const useUpdateAvailable = () => {
    const queryData = useQuery<CheckLatestVersionResult | undefined>({
        queryKey: ['system-update-available'],
        queryFn: () => api.checkLatestVersion(),
        refetchInterval: Infinity, // Disable automatic refetching
        refetchOnWindowFocus: false,
    })

    return queryData.data
}