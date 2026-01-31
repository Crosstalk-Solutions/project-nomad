import { Head } from '@inertiajs/react'
import SettingsLayout from '~/layouts/SettingsLayout'

export default function LegalPage() {
  return (
    <SettingsLayout>
      <Head title="Legal Notices | Project N.O.M.A.D." />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6 max-w-4xl">
          <h1 className="text-4xl font-semibold mb-8">Legal Notices</h1>

          {/* License Agreement */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">License Agreement</h2>
            <p className="text-gray-700 mb-3">Copyright 2025 Crosstalk Solutions, LLC</p>
            <p className="text-gray-700 mb-3">
              Permission is hereby granted, free of charge, to any person obtaining a copy of this
              software and associated documentation files (the &quot;Software&quot;), to deal in the Software
              without restriction, including without limitation the rights to use, copy, modify,
              merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
              permit persons to whom the Software is furnished to do so, subject to the following
              conditions: The above copyright notice and this permission notice shall be included in
              all copies or substantial portions of the Software.
            </p>
            <p className="text-gray-700">
              THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
              INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
              PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
              LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT
              OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
              OTHER DEALINGS IN THE SOFTWARE.
            </p>
          </section>

          {/* Third-Party Software */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">Third-Party Software Attribution</h2>
            <p className="text-gray-700 mb-4">
              Project N.O.M.A.D. integrates the following open source projects. We are grateful to
              their developers and communities:
            </p>
            <ul className="space-y-3 text-gray-700">
              <li>
                <strong>Kiwix</strong> - Offline Wikipedia and content reader (GPL-3.0 License)
                <br />
                <a href="https://kiwix.org" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://kiwix.org</a>
              </li>
              <li>
                <strong>Kolibri</strong> - Offline learning platform by Learning Equality (MIT License)
                <br />
                <a href="https://learningequality.org/kolibri" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://learningequality.org/kolibri</a>
              </li>
              <li>
                <strong>Ollama</strong> - Local large language model runtime (MIT License)
                <br />
                <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://ollama.com</a>
              </li>
              <li>
                <strong>CyberChef</strong> - Data analysis and encoding toolkit by GCHQ (Apache 2.0 License)
                <br />
                <a href="https://github.com/gchq/CyberChef" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://github.com/gchq/CyberChef</a>
              </li>
              <li>
                <strong>FlatNotes</strong> - Self-hosted note-taking application (MIT License)
                <br />
                <a href="https://github.com/dullage/flatnotes" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://github.com/dullage/flatnotes</a>
              </li>
            </ul>
          </section>

          {/* Privacy Statement */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">Privacy Statement</h2>
            <p className="text-gray-700 mb-3">
              Project N.O.M.A.D. is designed with privacy as a core principle:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li><strong>Zero Telemetry:</strong> N.O.M.A.D. does not collect, transmit, or store any usage data, analytics, or telemetry.</li>
              <li><strong>Local-First:</strong> All your data, downloaded content, AI conversations, and notes remain on your device.</li>
              <li><strong>No Accounts Required:</strong> N.O.M.A.D. operates without user accounts or authentication by default.</li>
              <li><strong>Network Optional:</strong> An internet connection is only required to download content or updates. All installed features work fully offline.</li>
            </ul>
          </section>

          {/* Content Disclaimer */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">Content Disclaimer</h2>
            <p className="text-gray-700 mb-3">
              Project N.O.M.A.D. provides tools to download and access content from third-party sources
              including Wikipedia, Wikibooks, medical references, educational platforms, and other
              publicly available resources.
            </p>
            <p className="text-gray-700 mb-3">
              Crosstalk Solutions, LLC does not create, control, verify, or guarantee the accuracy,
              completeness, or reliability of any third-party content. The inclusion of any content
              does not constitute an endorsement.
            </p>
            <p className="text-gray-700">
              Users are responsible for evaluating the appropriateness and accuracy of any content
              they download and use.
            </p>
          </section>

          {/* Medical Disclaimer */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">Medical and Emergency Information Disclaimer</h2>
            <p className="text-gray-700 mb-3">
              Some content available through N.O.M.A.D. includes medical references, first aid guides,
              and emergency preparedness information. This content is provided for general
              informational purposes only.
            </p>
            <p className="text-gray-700 mb-3 font-semibold">
              This information is NOT a substitute for professional medical advice, diagnosis, or treatment.
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
              <li>Always seek the advice of qualified health providers with questions about medical conditions.</li>
              <li>Never disregard professional medical advice or delay seeking it because of something you read in offline content.</li>
              <li>In a medical emergency, call emergency services immediately if available.</li>
              <li>Medical information may become outdated. Verify critical information with current professional sources when possible.</li>
            </ul>
          </section>

          {/* Data Storage Notice */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">Data Storage</h2>
            <p className="text-gray-700 mb-3">
              All data associated with Project N.O.M.A.D. is stored locally on your device:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li><strong>Installation Directory:</strong> /opt/project-nomad</li>
              <li><strong>Downloaded Content:</strong> /opt/project-nomad/storage</li>
              <li><strong>Application Data:</strong> Stored in Docker volumes on your local system</li>
            </ul>
            <p className="text-gray-700 mt-3">
              You maintain full control over your data. Uninstalling N.O.M.A.D. or deleting these
              directories will permanently remove all associated data.
            </p>
          </section>

        </main>
      </div>
    </SettingsLayout>
  )
}
