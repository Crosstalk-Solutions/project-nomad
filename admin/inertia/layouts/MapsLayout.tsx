import Footer from '~/components/Footer'

export default function MapsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 w-full bg-desert">{children}</div>
      <Footer />
    </div>
  )
}
