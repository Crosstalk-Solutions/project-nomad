import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { TransmitProvider } from 'react-adonis-transmit'
import ModalsProvider from '~/providers/ModalProvider'
import NotificationsProvider from '~/providers/NotificationProvider'
import { UsePageProps } from '../../types/system'
import { usePage } from '@inertiajs/react'

export default function Providers({
  children,
  queryClient,
}: {
  children: React.ReactNode
  queryClient: QueryClient
}) {
  const { environment } = usePage().props as unknown as UsePageProps

  return (
    <QueryClientProvider client={queryClient}>
      <TransmitProvider baseUrl={window.location.origin} enableLogging={true}>
        <NotificationsProvider>
          <ModalsProvider>
            {children}
            {['development', 'staging'].includes(environment) && (
              <ReactQueryDevtools initialIsOpen={false} />
            )}
          </ModalsProvider>
        </NotificationsProvider>
      </TransmitProvider>
    </QueryClientProvider>
  )
}
