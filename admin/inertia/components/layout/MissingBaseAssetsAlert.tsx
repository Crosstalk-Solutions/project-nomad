import AlertWithButton from "../AlertWithButton"

export type MissingBaseAssetsAlertProps = {
  onClickDownload?: () => Promise<void>
  loading?: boolean
}

const MissingBaseAssetsAlert = (props: MissingBaseAssetsAlertProps) => {
  return (
    <AlertWithButton
      title="The base map assets have not been installed. Please download them first to enable map functionality."
      type="warning"
      variant="solid"
      className="!mt-6"
      buttonProps={{
        variant: 'secondary',
        children: 'Download Base Assets',
        icon: 'ArrowDownTrayIcon',
        loading: props.loading || false,
        onClick: () => {
          if (props.onClickDownload) {
            return props.onClickDownload()
          }
        }
      }}
    />
  )
}

export default MissingBaseAssetsAlert
