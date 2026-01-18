import { useState } from 'react'
import { NotificationContext, Notification } from '../context/NotificationContext'
import {
  CheckCircleIcon,
  InformationCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'

const NotificationsProvider = ({ children }: { children: React.ReactNode }) => {
  const [notifications, setNotifications] = useState<(Notification & { id: string })[]>([])

  const addNotification = (newNotif: Notification) => {
    const { message, type, duration = 5000 } = newNotif
    const id = crypto.randomUUID()
    setNotifications((prev) => [...prev, { id, message, type, duration }])

    if (duration > 0) {
      setTimeout(() => {
        removeNotification(id)
      }, duration)
    }
  }

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  const removeAllNotifications = () => {
    setNotifications([])
  }

  const Icon = ({ type }: { type: string }) => {
    switch (type) {
      case 'error':
        return <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
      case 'success':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />
      case 'info':
        return <InformationCircleIcon className="h-5 w-5 text-blue-500" />
      default:
        return <InformationCircleIcon className="h-5 w-5 text-blue-500" />
    }
  }

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        addNotification,
        removeNotification,
        removeAllNotifications,
      }}
    >
      {children}
      <div className="!fixed bottom-16 right-0 p-4 z-[9999]">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`mb-4 p-4 rounded shadow-md border border-slate-300 bg-white max-w-96`}
            onClick={() => removeNotification(notification.id)}
          >
            <div className="flex flex-row justify-between items-center">
              <div className="mr-2">
                <Icon type={notification.type} />
              </div>
              <div>
                <p className="break-all">{notification.message}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  )
}

export default NotificationsProvider
