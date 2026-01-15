// Helper hook to check internet connection status
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import api from '~/lib/api';

const useInternetStatus = () => {
    const [isOnline, setIsOnline] = useState<boolean>(true); // Initialize true to avoid "offline" flicker on load
    const { data } = useQuery<boolean>({
        queryKey: ['internetStatus'],
        queryFn: async () => (await api.getInternetStatus()) ?? false,
        refetchOnWindowFocus: false, // Don't refetch on window focus
        refetchOnReconnect: true, // Refetch when the browser reconnects
        refetchOnMount: false, // Don't refetch when the component mounts
        retry: 0, // Retry already handled in backend
        staleTime: 1000 * 60 * 5, // Data is fresh for 5 minutes
    });

    // Update the online status when data changes
    useEffect(() => {
        if (data === undefined) return; // Avoid setting state on unmounted component
        setIsOnline(data);
    }, [data]);

    return { isOnline };
};

export default useInternetStatus;