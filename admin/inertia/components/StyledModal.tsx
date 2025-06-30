import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import StyledButton from './StyledButton'
import React from 'react'

interface StyledModalProps {
  onClose?: () => void
  title: string
  cancelText?: string
  confirmText?: string
  open: boolean
  onCancel?: () => void
  onConfirm?: () => void
  children: React.ReactNode
  icon?: React.ReactNode
}

const StyledModal: React.FC<StyledModalProps> = ({
  children,
  title,
  open,
  onClose,
  cancelText = 'Cancel',
  confirmText = 'Confirm',
  onCancel,
  onConfirm,
  icon,
}) => {
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (onClose) onClose()
      }}
      className="relative z-50"
    >
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-gray-500/75 transition-opacity data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in"
      />
      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          <DialogPanel
            transition
            className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all data-[closed]:translate-y-4 data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in sm:my-8 sm:w-full sm:max-w-lg sm:p-6 data-[closed]:sm:translate-y-0 data-[closed]:sm:scale-95"
          >
            <div>
              {icon && <div className="flex items-center justify-center">{icon}</div>}
              <div className="mt-3 text-center sm:mt-5">
                <DialogTitle as="h3" className="text-base font-semibold text-gray-900">
                  {title}
                </DialogTitle>
                <div className="mt-2">{children}</div>
              </div>
            </div>
            <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
              <StyledButton
                variant="secondary"
                onClick={() => {
                  if (onCancel) onCancel()
                }}
              >
                {cancelText}
              </StyledButton>
              <StyledButton
                variant="action"
                onClick={() => {
                  if (onConfirm) onConfirm()
                }}
              >
                {confirmText}
              </StyledButton>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}

export default StyledModal
