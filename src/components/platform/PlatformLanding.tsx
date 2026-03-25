import Link from 'next/link';
import PlatformNav from '@/components/platform/PlatformNav';
import PlatformFooter from '@/components/platform/PlatformFooter';

export function PlatformLanding() {
  return (
    <>
      <PlatformNav />

      {/* Hero */}
      <section className="flex flex-col items-center justify-center bg-gradient-to-b from-indigo-50 to-white px-6 py-24 text-center">
        <span className="mb-4 inline-block rounded-full bg-indigo-100 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-indigo-600">
          Map. Track. Collaborate.
        </span>
        <h1 className="mb-6 max-w-3xl text-5xl font-extrabold leading-tight text-gray-900">
          Field mapping for conservation teams
        </h1>
        <p className="mb-10 max-w-xl text-lg text-gray-500">
          FieldMapper gives your conservation organization a purpose-built platform to map
          habitats, track field observations, and coordinate volunteers — all in one place.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row">
          <Link
            href="/signup"
            className="rounded-md bg-indigo-600 px-8 py-3 text-base font-semibold text-white shadow-md hover:bg-indigo-700 transition-colors"
          >
            Start Free Trial
          </Link>
          <Link
            href="/signin"
            className="rounded-md border border-gray-300 px-8 py-3 text-base font-semibold text-gray-700 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto w-full max-w-5xl px-6 py-20">
        <div className="grid gap-10 sm:grid-cols-3">
          <div className="flex flex-col items-start gap-4 rounded-xl border border-gray-100 bg-white p-8 shadow-sm">
            <span className="text-4xl">🤖</span>
            <h3 className="text-lg font-bold text-gray-900">AI-Powered Setup</h3>
            <p className="text-sm text-gray-500">
              Describe your project and our AI builds your workspace — item types, map
              configuration, landing page, and more. Fully customizable if you want to
              fine-tune.
            </p>
          </div>
          <div className="flex flex-col items-start gap-4 rounded-xl border border-gray-100 bg-white p-8 shadow-sm">
            <span className="text-4xl">🗺️</span>
            <h3 className="text-lg font-bold text-gray-900">Multi-Property Maps</h3>
            <p className="text-sm text-gray-500">
              Manage multiple sites under one organization. Each property gets its own
              interactive map, team, and custom domain.
            </p>
          </div>
          <div className="flex flex-col items-start gap-4 rounded-xl border border-gray-100 bg-white p-8 shadow-sm">
            <span className="text-4xl">👥</span>
            <h3 className="text-lg font-bold text-gray-900">Team Collaboration</h3>
            <p className="text-sm text-gray-500">
              Invite volunteers, assign roles, grant temporary access for events, and share
              public dashboards.
            </p>
          </div>
        </div>
      </section>

      {/* Bottom CTA Bar */}
      <section className="bg-indigo-600 px-6 py-16 text-center text-white">
        <h2 className="mb-2 text-3xl font-extrabold">Ready to get started?</h2>
        <p className="mb-8 text-indigo-200">Free trial — no credit card required.</p>
        <Link
          href="/signup"
          className="inline-block rounded-md bg-white px-8 py-3 text-base font-semibold text-indigo-600 shadow hover:bg-indigo-50 transition-colors"
        >
          Create Your Account
        </Link>
      </section>

      <PlatformFooter />
    </>
  );
}
