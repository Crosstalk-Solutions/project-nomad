export default function ServerError(props: { error: any }) {
  return (
    <>
      <div className="container max-sm:px-4 max-sm:py-4 [overflow-wrap:anywhere]">
        <div className="title">Server Error</div>

        <span>{props.error.message}</span>
      </div>
    </>
  )
}
