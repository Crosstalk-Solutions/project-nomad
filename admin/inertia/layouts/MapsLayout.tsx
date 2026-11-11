import Footer from '~/components/Footer'

export default function MapsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <div className="min-h-0 w-full flex-1 bg-desert">{children}</div>
      <div className="shrink-0 [&_footer>div]:flex-wrap [&_footer>div]:px-2 [&_footer>div]:py-2">
        <Footer />
      </div>
    </div>
  )
}
