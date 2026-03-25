import { Head } from '@inertiajs/react'
import { IconExternalLink } from '@tabler/icons-react'
import SettingsLayout from '~/layouts/SettingsLayout'

export default function SupportPage() {
  return (
    <SettingsLayout>
      <Head title="Support the Project | Project N.O.M.A.D." />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6 max-w-4xl">
          <h1 className="text-4xl font-semibold mb-4">Support the Project</h1>
          <p className="text-text-muted mb-10 text-lg">
            Project NOMAD is 100% free and open source — no subscriptions, no paywalls, no catch.
            If you'd like to help keep the project going, here are a few ways to show your support.
          </p>

          {/* Ko-fi */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-3">Buy Us a Coffee</h2>
            <p className="text-text-muted mb-4">
              Every contribution helps fund development, server costs, and new content packs for NOMAD.
              Even a small donation goes a long way.
            </p>
            <a
              href="https://ko-fi.com/crosstalk"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#FF5E5B] hover:bg-[#e54e4b] text-white font-semibold rounded-lg transition-colors"
            >
              Support on Ko-fi
              <IconExternalLink size={18} />
            </a>
          </section>

          {/* Rogue Support */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-3">Need Help With Your Home Network?</h2>
            <a
              href="https://roguesupport.com"
              target="_blank"
              rel="noopener noreferrer"
              className="block mb-4 rounded-lg overflow-hidden hover:opacity-90 transition-opacity"
            >
              <img
                src="/rogue-support-banner.png"
                alt="Rogue Support — Conquer Your Home Network"
                className="w-full"
              />
            </a>
            <p className="text-text-muted mb-4">
              Rogue Support is a networking consultation service for home users.
              Think of it as Uber for computer networking — expert help when you need it.
            </p>
            <a
              href="https://roguesupport.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-blue-600 hover:underline font-medium"
            >
              Visit RogueSupport.com
              <IconExternalLink size={16} />
            </a>
          </section>

          {/* Other Ways to Help */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-3">Other Ways to Help</h2>
            <ul className="space-y-2 text-text-muted">
              <li>
                <a
                  href="https://github.com/Crosstalk-Solutions/project-nomad"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Star the project on GitHub
                </a>
                {' '}— it helps more people discover NOMAD
              </li>
              <li>
                <a
                  href="https://github.com/Crosstalk-Solutions/project-nomad/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Report bugs and suggest features
                </a>
                {' '}— every report makes NOMAD better
              </li>
              <li>Share NOMAD with someone who'd use it — word of mouth is the best marketing</li>
              <li>
                <a
                  href="https://discord.com/invite/crosstalksolutions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Join the Discord community
                </a>
                {' '}— hang out, share your build, help other users
              </li>
            </ul>
          </section>

        </main>
      </div>
    </SettingsLayout>
  )
}
