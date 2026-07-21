import api from "~/lib/api"
import { useQuery } from "@tanstack/react-query"

export const BENCHMARK_RERUN_BANNER_QUERY_KEY = ['benchmark-rerun-banner']

export const useBenchmarkRerunBanner = () => {
    const queryData = useQuery<{ show: boolean } | undefined>({
        queryKey: BENCHMARK_RERUN_BANNER_QUERY_KEY,
        queryFn: () => api.checkBenchmarkRerunBanner(),
        refetchInterval: Infinity, // Disable automatic refetching
        refetchOnWindowFocus: false,
    })

    return queryData.data
}
