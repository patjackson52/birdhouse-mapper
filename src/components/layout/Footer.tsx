import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-forest-dark text-white/70 py-8 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <h3 className="font-heading font-semibold text-white text-lg mb-2">
              IslandWood Birdhouses
            </h3>
            <p className="text-sm">
              An Eagle Scout service project dedicated to building and
              monitoring birdhouses at IslandWood camp on Bainbridge Island, WA.
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
                  Birdhouse List
                </Link>
              </li>
              <li>
                <Link href="/birds" className="hover:text-golden transition-colors">
                  Birds of IslandWood
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-golden transition-colors">
                  About the Project
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-white mb-2">IslandWood</h4>
            <p className="text-sm">
              IslandWood is an outdoor learning center on Bainbridge Island,
              Washington, inspiring lifelong environmental and community
              stewardship.
            </p>
            <a
              href="https://islandwood.org"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2 text-sm text-golden hover:text-golden/80 transition-colors"
            >
              Visit islandwood.org &rarr;
            </a>
          </div>
        </div>
        <div className="border-t border-white/10 mt-6 pt-6 text-center text-xs">
          <p>&copy; {new Date().getFullYear()} IslandWood Birdhouse Project. Built with care for conservation.</p>
        </div>
      </div>
    </footer>
  );
}
