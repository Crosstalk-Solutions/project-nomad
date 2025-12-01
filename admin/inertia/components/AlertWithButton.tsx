import Alert, { AlertProps } from './Alert'
import StyledButton, { StyledButtonProps } from './StyledButton'

export type AlertWithButtonProps = {
  buttonProps: StyledButtonProps
} & AlertProps

const AlertWithButton = ({ buttonProps, ...alertProps }: AlertWithButtonProps) => {
  return (
    <Alert {...alertProps}>
      <StyledButton {...buttonProps} />
    </Alert>
  )
}

export default AlertWithButton