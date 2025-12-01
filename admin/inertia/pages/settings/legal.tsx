import { Head } from '@inertiajs/react'
import SettingsLayout from '~/layouts/SettingsLayout'

export default function SettingsPage() {
  return (
    <SettingsLayout>
      <Head title="Legal Notices" />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6">
          <h1 className="text-4xl font-semibold mb-6">Legal Notices</h1>
          <h2 className="text-2xl font-semibold mb-2">License Agreement & Terms of Use</h2>
          <p className="text-gray-900 mb-2">Copyright 2025 Crosstalk Solutions, LLC</p>
          <p className="text-gray-900 mb-2">
            Permission is hereby granted, free of charge, to any person obtaining a copy of this
            software and associated documentation files (the “Software”), to deal in the Software
            without restriction, including without limitation the rights to use, copy, modify,
            merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
            permit persons to whom the Software is furnished to do so, subject to the following
            conditions: The above copyright notice and this permission notice shall be included in
            all copies or substantial portions of the Software.
          </p>
          <p className="text-gray-900 mb-2">
            THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
            INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
            PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
            LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT
            OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
            OTHER DEALINGS IN THE SOFTWARE.
          </p>
        </main>
      </div>
    </SettingsLayout>
  )
}
