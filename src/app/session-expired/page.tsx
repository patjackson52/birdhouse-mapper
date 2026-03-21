import Link from 'next/link';
import Footer from '@/components/layout/Footer';

export default function SessionExpiredPage({
  searchParams,
}: {
  searchParams: { convertible?: string };
}) {
  const isConvertible = searchParams.convertible === 'true';

  return (
    <div className="pb-20 md:pb-0">
      <div className="min-h-[calc(100vh-10rem)] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <span className="text-4xl mb-3 block">👋</span>
          <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-2">
            Session Ended
          </h1>
          <p className="text-sm text-sage mb-6">
            Your guest session has ended. Thanks for contributing!
          </p>
          {isConvertible && (
            <p className="text-xs text-sage mb-6">
              Your admin may convert your account to permanent access.
              Check back with them if needed.
            </p>
          )}
          <Link
            href="/"
            className="btn-primary inline-block"
          >
            View the Map
          </Link>
        </div>
      </div>
      <Footer />
    </div>
  );
}
