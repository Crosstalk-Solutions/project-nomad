// Helper hook to check internet connection status
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { testInternetConnection } from '~/lib/util';

const useInternetStatus = () => {
    const [isOnline, setIsOnline] = useState<boolean>(false);
    const { data } = useQuery<boolean>({
        queryKey: ['internetStatus'],
        queryFn: testInternetConnection,
        refetchOnWindowFocus: false, // Don't refetch on window focus
        refetchOnReconnect: false, // Refetch when the browser reconnects
        refetchOnMount: false, // Don't refetch when the component mounts
        retry: 2, // Retry up to 2 times on failure
        staleTime: 1000 * 60 * 10, // Data is fresh for 10 minutes
    });

    // Update the online status when data changes
    useEffect(() => {
        if (data === undefined) return; // Avoid setting state on unmounted component
        setIsOnline(data);
    }, [data]);

    return { isOnline };
};

export default useInternetStatus;