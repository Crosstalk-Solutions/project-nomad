import { useState, useEffect } from 'react'
import { NotificationContext, Notification } from '../context/NotificationContext'
import { IconExclamationCircle, IconCircleCheck, IconInfoCircle } from '@tabler/icons-react'
import { setGlobalNotificationCallback } from '~/lib/util'

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

  // Set the global notification callback when provider mounts
  useEffect(() => {
    setGlobalNotificationCallback(addNotification)
    return () => {
      setGlobalNotificationCallback(() => {})
    }
  }, [])

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  const removeAllNotifications = () => {
    setNotifications([])
  }

  const Icon = ({ type }: { type: string }) => {
    switch (type) {
      case 'error':
        return <IconExclamationCircle className="h-5 w-5 text-red-500" />
      case 'success':
        return <IconCircleCheck className="h-5 w-5 text-green-500" />
      case 'info':
        return <IconInfoCircle className="h-5 w-5 text-blue-500" />
      default:
        return <IconInfoCircle className="h-5 w-5 text-blue-500" />
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
            <div className="flex flex-row items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <Icon type={notification.type} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="break-words">{notification.message}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  )
}

export default NotificationsProvider
