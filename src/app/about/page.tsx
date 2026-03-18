import { getConfig } from '@/lib/config/server';

export default async function AboutPage() {
  const config = await getConfig();

  return (
    <div className="pb-20 md:pb-0">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="font-heading text-3xl font-semibold text-forest-dark mb-6">
          About
        </h1>
        <div className="prose prose-forest max-w-none">
          {/* Render markdown as simple paragraphs for now.
              Full markdown rendering will be added in Phase 4. */}
          {config.aboutContent.split('\n').map((line, i) => {
            if (line.startsWith('# ')) return null; // Skip h1 (we have our own)
            if (line.startsWith('## ')) {
              return (
                <h2 key={i} className="font-heading text-xl font-semibold text-forest-dark mt-6 mb-3">
                  {line.replace('## ', '')}
                </h2>
              );
            }
            if (line.trim() === '') return <br key={i} />;
            return (
              <p key={i} className="text-forest-dark/80 leading-relaxed mb-3">
                {line}
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
}
