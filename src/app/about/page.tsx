'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Footer from '@/components/layout/Footer';

export default function AboutPage() {
  const [birdhouseCount, setBirdhouseCount] = useState({ total: 0, active: 0 });

  useEffect(() => {
    async function fetchStats() {
      const supabase = createClient();
      const { data } = await supabase
        .from('birdhouses')
        .select('status');

      if (data) {
        setBirdhouseCount({
          total: data.length,
          active: data.filter((b) => b.status === 'active').length,
        });
      }
    }

    fetchStats();
  }, []);

  return (
    <div className="pb-20 md:pb-0">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero */}
        <div className="text-center mb-10">
          <h1 className="font-heading text-3xl sm:text-4xl font-semibold text-forest-dark mb-3">
            About This Eagle Scout Project
          </h1>
          <p className="text-sage text-lg">
            Building birdhouses for the birds of IslandWood
          </p>
        </div>

        {/* Progress tracker */}
        <div className="card mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading text-lg font-semibold text-forest-dark">
              Project Progress
            </h2>
            <span className="text-sm text-forest font-medium">
              {birdhouseCount.active} of {birdhouseCount.total} installed
            </span>
          </div>
          <div className="w-full bg-sage-light rounded-full h-3">
            <div
              className="bg-forest h-3 rounded-full transition-all duration-500"
              style={{
                width:
                  birdhouseCount.total > 0
                    ? `${(birdhouseCount.active / birdhouseCount.total) * 100}%`
                    : '0%',
              }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="prose prose-sm max-w-none">
          <section className="mb-8">
            <h2 className="font-heading text-2xl font-semibold text-forest-dark mb-3">
              The Project
            </h2>
            <p className="text-forest-dark/80 leading-relaxed mb-4">
              This Eagle Scout project focuses on designing, building, and installing birdhouses
              at IslandWood, an outdoor learning center on Bainbridge Island, Washington. The
              goal is to support local bird populations by providing safe nesting sites, while
              creating an educational resource for the students and visitors who experience
              IslandWood&apos;s programs.
            </p>
            <p className="text-forest-dark/80 leading-relaxed">
              Each birdhouse is carefully designed for specific bird species, with appropriate
              entrance hole sizes, mounting heights, and orientations. The birdhouses are
              monitored regularly to track nesting activity and maintain the structures.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-heading text-2xl font-semibold text-forest-dark mb-3">
              What is an Eagle Scout Project?
            </h2>
            <p className="text-forest-dark/80 leading-relaxed mb-4">
              An Eagle Scout service project is a required component for earning the rank of
              Eagle Scout, the highest achievement in the Boy Scouts of America. The project
              must demonstrate leadership, planning, and service to the community. The Scout
              must plan, develop, and lead the project from start to finish.
            </p>
            <p className="text-forest-dark/80 leading-relaxed">
              Eagle Scout projects benefit organizations such as religious institutions,
              schools, community groups, and in this case, an outdoor learning center. The
              project must be approved by the Scout&apos;s troop and the benefiting organization
              before work begins.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-heading text-2xl font-semibold text-forest-dark mb-3">
              About IslandWood
            </h2>
            <p className="text-forest-dark/80 leading-relaxed mb-4">
              IslandWood is a 255-acre outdoor learning center located on Bainbridge Island,
              Washington. Founded in 2002, IslandWood provides immersive learning experiences
              that inspire lifelong environmental and community stewardship. The campus
              features diverse ecosystems including forests, wetlands, meadows, and a bog,
              making it an ideal habitat for a variety of bird species.
            </p>
            <a
              href="https://islandwood.org"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-forest font-medium hover:text-forest-dark transition-colors"
            >
              Visit IslandWood&apos;s website
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </section>

          <section className="mb-8">
            <h2 className="font-heading text-2xl font-semibold text-forest-dark mb-3">
              Goals
            </h2>
            <ul className="space-y-2 text-forest-dark/80">
              <li className="flex items-start gap-2">
                <span className="text-forest mt-0.5">&#x2022;</span>
                Build and install birdhouses designed for species native to the IslandWood area
              </li>
              <li className="flex items-start gap-2">
                <span className="text-forest mt-0.5">&#x2022;</span>
                Monitor nesting activity to contribute to local wildlife data
              </li>
              <li className="flex items-start gap-2">
                <span className="text-forest mt-0.5">&#x2022;</span>
                Create educational signage and digital resources for IslandWood visitors
              </li>
              <li className="flex items-start gap-2">
                <span className="text-forest mt-0.5">&#x2022;</span>
                Build a website to track birdhouse locations and observations over time
              </li>
              <li className="flex items-start gap-2">
                <span className="text-forest mt-0.5">&#x2022;</span>
                Leave a lasting resource that future students and staff can maintain
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-heading text-2xl font-semibold text-forest-dark mb-3">
              Acknowledgments
            </h2>
            <p className="text-forest-dark/80 leading-relaxed">
              This project would not have been possible without the support of IslandWood
              staff, the Scout troop leadership, family members, and community volunteers
              who helped build and install the birdhouses. Special thanks to IslandWood for
              providing access to their campus and supporting this conservation effort.
            </p>
          </section>
        </div>
      </div>
      <Footer />
    </div>
  );
}
