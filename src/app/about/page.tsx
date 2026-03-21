import { getConfig } from '@/lib/config/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default async function AboutPage() {
  const config = await getConfig();

  return (
    <div className="pb-20 md:pb-0">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="font-heading text-3xl font-semibold text-forest-dark mb-6">
          About
        </h1>
        <div className="prose prose-forest max-w-none text-forest-dark/80">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {config.aboutContent}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
