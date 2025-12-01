import Footer from "~/components/Footer";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="p-2 flex gap-2 flex-col items-center justify-center cursor-pointer" onClick={() => window.location.href = '/home'}>
        <img src="/project_nomad_logo.png" alt="Project Nomad Logo" className="h-40 w-40" />
        <h1 className="text-5xl font-bold text-desert-green">Command Center</h1>
      </div>
      <hr className="text-desert-green font-semibold h-[1.5px] bg-desert-green border-none" />
      <div className="flex-1 w-full bg-desert">{children}</div>
      {/* <TanStackRouterDevtools /> */}
      {/* <hr className="text-desert-green font-semibold h-[1.5px] bg-desert-green border-none" />
      <div className="p-2 flex flex-col items-center justify-center ">
        <p className="text-sm text-gray-900 italic">
          Sapientia ianua vitae | Wisdom is the gateway to life
        </p>
        <p
        className="text-desert-orange font-semibold text-sm italic"
        >A project by Crosstalk Solutions</p>
      </div> */}
      <Footer />
    </div>
  )
}
