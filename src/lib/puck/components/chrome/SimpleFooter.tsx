import type { SimpleFooterProps } from '../../types';

export function SimpleFooter({ text, links, showPoweredBy }: SimpleFooterProps) {
  return (
    <footer className="border-t border-gray-200 px-4 py-4">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 text-sm text-gray-600">
        <span>{text}</span>
        {links?.length > 0 && (
          <div className="flex gap-4">
            {links.map((link, i) => <a key={i} href={link.url} className="hover:text-gray-900 hover:underline">{link.label}</a>)}
          </div>
        )}
      </div>
      {showPoweredBy && <div className="mt-2 text-center text-xs text-gray-400">Powered by FieldMapper</div>}
    </footer>
  );
}
