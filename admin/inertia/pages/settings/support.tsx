import { Head } from '@inertiajs/react'
import { IconExternalLink } from '@tabler/icons-react'
import SettingsLayout from '~/layouts/SettingsLayout'

const RHINOVAULT_REPO = 'https://github.com/rhinopctec/project-RhinoVault'

export default function SupportPage() {
  return (
    <SettingsLayout>
      <Head title="Support | RhinoVault" />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6 max-w-4xl">
          <h1 className="text-4xl font-semibold mb-4">Support</h1>
          <p className="text-text-muted mb-10 text-lg">
            RhinoVault is built and supported by RhinoPCTec. Here's how to get help and how to
            help the project.
          </p>

          {/* RhinoPCTec support */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-3">Get Help from RhinoPCTec</h2>
            <p className="text-text-muted mb-4">
              Need help with setup, hardware, content, or a problem with your RhinoVault? Open a
              support request and include the output of <strong>Debug Info</strong> (in the page
              footer) so we can troubleshoot faster.
            </p>
            <a
              href={`${RHINOVAULT_REPO}/issues/new/choose`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-desert-green hover:opacity-90 text-white font-semibold rounded-lg transition-opacity"
            >
              Open a Support Request
              <IconExternalLink size={18} />
            </a>
          </section>

          {/* Other Ways to Help */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-3">Other Ways to Help</h2>
            <ul className="space-y-2 text-text-muted">
              <li>
                <a
                  href={RHINOVAULT_REPO}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Star RhinoVault on GitHub
                </a>
                {' '}— it helps more people discover RhinoVault
              </li>
              <li>
                <a
                  href={`${RHINOVAULT_REPO}/issues`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Report bugs and suggest features
                </a>
                {' '}— every report makes RhinoVault better
              </li>
              <li>Share RhinoVault with someone who'd use it</li>
            </ul>
          </section>

          {/* Upstream credit */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-3">Built on Project N.O.M.A.D.</h2>
            <p className="text-text-muted mb-4">
              RhinoVault is based on Project N.O.M.A.D., the free and open-source offline knowledge
              server from Crosstalk Solutions. If RhinoVault is useful to you, consider supporting
              the upstream project too.
            </p>
            <a
              href="https://github.com/Crosstalk-Solutions/project-nomad"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-blue-600 hover:underline font-medium"
            >
              Project N.O.M.A.D. on GitHub
              <IconExternalLink size={16} />
            </a>
          </section>
        </main>
      </div>
    </SettingsLayout>
  )
}
