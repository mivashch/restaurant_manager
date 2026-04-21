import { useState } from 'react'

export default function App() {
  const [privateId, setPrivateId] = useState('')

  const handleSubmit = (_data: FormData) => {
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
      <header className="bg-white border-b border-neutral-200 px-6 py-4">
        <span className="text-sm font-medium tracking-widest uppercase text-neutral-400">
          Restaurant Table Management
        </span>
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold text-neutral-800 mb-8">
            Login
          </h1>

          <form action={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="privateId"
                className="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2"
              >
                Private ID
              </label>
              <input
                id="privateId"
                type="text"
                value={privateId}
                onChange={(e) => setPrivateId(e.target.value)}
                placeholder="Enter your private ID"
                className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-white text-neutral-800 placeholder-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800 focus:border-transparent transition"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-neutral-800 text-white text-sm font-medium hover:bg-neutral-700 active:bg-neutral-900 transition cursor-pointer"
            >
              Continue
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}