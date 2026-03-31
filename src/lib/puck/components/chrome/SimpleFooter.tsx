import type { SimpleFooterProps } from '../../types';
import { resolveLink } from '../../fields/link-utils';

export function SimpleFooter({ text, links, showPoweredBy }: SimpleFooterProps) {
  return (
    <footer className="border-t border-gray-200 px-4 py-4">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 text-sm text-gray-600">
        <span>{text}</span>
        {links?.length > 0 && (
          <div className="flex gap-4">
            {links.map((link, i) => {
              const resolved = resolveLink(link.url);
              return (
                <a
                  key={i}
                  href={resolved.href}
                  target={resolved.target}
                  className="hover:text-gray-900 hover:underline"
                  style={resolved.color ? { color: resolved.color } : undefined}
                >
                  {link.label}
                </a>
              );
            })}
          </div>
        )}
      </div>
      {showPoweredBy && <div className="mt-2 text-center text-xs text-gray-400">Powered by FieldMapper</div>}
    </footer>
  );
}
