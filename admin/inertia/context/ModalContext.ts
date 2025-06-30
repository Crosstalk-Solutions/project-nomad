import { createContext, useContext, ReactNode } from 'react'

interface ModalContextProps {
  openModal: (content: ReactNode, id: string, preventClose?: boolean) => void
  closeModal: (id: string) => void
  closeAllModals: () => void
  _getCurrentModals: () => Record<string, ReactNode>
  preventCloseOnOverlayClick?: boolean
}

export const ModalContext = createContext<ModalContextProps | undefined>(undefined)

export const useModals = () => {
  const context = useContext(ModalContext)
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider')
  }
  return context
}
