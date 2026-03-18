'use client';

import Link from 'next/link';
import { useConfig } from '@/lib/config/client';

export default function Footer() {
  const config = useConfig();

  return (
    <footer className="bg-forest-dark text-white/70 py-8 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-heading font-semibold text-white text-lg mb-2">
              {config.siteName}
            </h3>
            <p className="text-sm">
              {config.tagline}
            </p>
          </div>
          <div>
            <h4 className="font-medium text-white mb-2">Links</h4>
            <ul className="space-y-1 text-sm">
              <li>
                <Link href="/" className="hover:text-golden transition-colors">
                  Map View
                </Link>
              </li>
              <li>
                <Link href="/list" className="hover:text-golden transition-colors">
                  List View
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-golden transition-colors">
                  About
                </Link>
              </li>
              {config.footerLinks.map((link) => (
                <li key={link.url}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-golden transition-colors"
                  >
                    {link.label} &rarr;
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 mt-6 pt-6 text-center text-xs">
          <p>&copy; {new Date().getFullYear()} {config.footerText}</p>
        </div>
      </div>
    </footer>
  );
}
