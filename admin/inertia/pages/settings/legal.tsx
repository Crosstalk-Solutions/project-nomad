import { Head } from '@inertiajs/react'
import SettingsLayout from '~/layouts/SettingsLayout'

export default function LegalPage() {
  return (
    <SettingsLayout>
      <Head title="Legal Notices | RhinoVault" />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6 max-w-4xl">
          <h1 className="text-4xl font-semibold mb-8">Legal Notices</h1>

          {/* License Agreement */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">License Agreement</h2>
            <p className="text-text-primary mb-3">RhinoVault modifications copyright 2026 RhinoPCTec</p>
            <p className="text-text-primary mb-3">
              Based on Project N.O.M.A.D., copyright 2024-2026 Crosstalk Solutions, LLC. Project
              N.O.M.A.D. is a trademark of Crosstalk Solutions, LLC. RhinoVault is an independent
              project and is not affiliated with or endorsed by Crosstalk Solutions, LLC.
            </p>
            <p className="text-text-primary mb-3">
              Licensed under the Apache License, Version 2.0 (the &quot;License&quot;);
              you may not use this file except in compliance with the License.
              You may obtain a copy of the License at
            </p>
            <p className="text-text-primary mb-3">
              <a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://www.apache.org/licenses/LICENSE-2.0</a>
            </p>
            <p className="text-text-primary">
              Unless required by applicable law or agreed to in writing, software
              distributed under the License is distributed on an &quot;AS IS&quot; BASIS,
              WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
              See the License for the specific language governing permissions and
              limitations under the License.
            </p>
          </section>

          {/* Third-Party Software */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">Third-Party Software Attribution</h2>
            <p className="text-text-primary mb-4">
              RhinoVault integrates the following open source projects. We are grateful to
              their developers and communities:
            </p>
            <ul className="space-y-3 text-text-primary">
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
              <li>
                <strong>Qdrant</strong> - Vector search engine for AI knowledge base (Apache 2.0 License)
                <br />
                <a href="https://github.com/qdrant/qdrant" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://github.com/qdrant/qdrant</a>
              </li>
            </ul>
          </section>

          {/* Privacy Statement */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">Privacy Statement</h2>
            <p className="text-text-primary mb-3">
              RhinoVault is designed with privacy as a core principle:
            </p>
            <ul className="list-disc list-inside space-y-2 text-text-primary">
              <li><strong>Zero Telemetry:</strong> N.O.M.A.D. does not collect, transmit, or store any usage data, analytics, or telemetry.</li>
              <li><strong>Local-First:</strong> All your data, downloaded content, AI conversations, and notes remain on your device.</li>
              <li><strong>No Accounts Required:</strong> N.O.M.A.D. operates without user accounts or authentication by default.</li>
              <li><strong>Network Optional:</strong> An internet connection is only required to download content or updates. All installed features work fully offline.</li>
            </ul>
          </section>

          {/* Content Disclaimer */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">Content Disclaimer</h2>
            <p className="text-text-primary mb-3">
              RhinoVault provides tools to download and access content from third-party sources
              including Wikipedia, Wikibooks, medical references, educational platforms, and other
              publicly available resources.
            </p>
            <p className="text-text-primary mb-3">
              RhinoPCTec and Crosstalk Solutions, LLC do not create, control, verify, or guarantee the accuracy,
              completeness, or reliability of any third-party content. The inclusion of any content
              does not constitute an endorsement.
            </p>
            <p className="text-text-primary">
              Users are responsible for evaluating the appropriateness and accuracy of any content
              they download and use.
            </p>
          </section>

          {/* Medical Disclaimer */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">Medical and Emergency Information Disclaimer</h2>
            <p className="text-text-primary mb-3">
              Some content available through N.O.M.A.D. includes medical references, first aid guides,
              and emergency preparedness information. This content is provided for general
              informational purposes only.
            </p>
            <p className="text-text-primary mb-3 font-semibold">
              This information is NOT a substitute for professional medical advice, diagnosis, or treatment.
            </p>
            <ul className="list-disc list-inside space-y-2 text-text-primary mb-3">
              <li>Always seek the advice of qualified health providers with questions about medical conditions.</li>
              <li>Never disregard professional medical advice or delay seeking it because of something you read in offline content.</li>
              <li>In a medical emergency, call emergency services immediately if available.</li>
              <li>Medical information may become outdated. Verify critical information with current professional sources when possible.</li>
            </ul>
          </section>

          {/* Data Storage Notice */}
          <section className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">Data Storage</h2>
            <p className="text-text-primary mb-3">
              All data associated with RhinoVault is stored locally on your device:
            </p>
            <ul className="list-disc list-inside space-y-2 text-text-primary">
              <li><strong>Installation Directory:</strong> /opt/project-nomad</li>
              <li><strong>Downloaded Content:</strong> /opt/project-nomad/storage</li>
              <li><strong>Application Data:</strong> Stored in Docker volumes on your local system</li>
            </ul>
            <p className="text-text-primary mt-3">
              You maintain full control over your data. Uninstalling N.O.M.A.D. or deleting these
              directories will permanently remove all associated data.
            </p>
          </section>

        </main>
      </div>
    </SettingsLayout>
  )
}
