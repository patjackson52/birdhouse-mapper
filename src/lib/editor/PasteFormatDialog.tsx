// src/lib/editor/PasteFormatDialog.tsx

interface PasteFormatDialogProps {
  onKeep: () => void;
  onPlainText: () => void;
}

export function PasteFormatDialog({ onKeep, onPlainText }: PasteFormatDialogProps) {
  return (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white border border-sage-light rounded-lg shadow-lg px-4 py-3 z-50 whitespace-nowrap">
      <p className="text-sm text-forest-dark mb-2">Pasted content contains formatting.</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onKeep}
          className="px-3 py-1 text-sm rounded bg-sage-light text-forest-dark hover:bg-sage/20 transition-colors"
        >
          Keep
        </button>
        <button
          type="button"
          onClick={onPlainText}
          className="px-3 py-1 text-sm rounded bg-forest text-white hover:bg-forest-dark transition-colors"
        >
          Plain text
        </button>
      </div>
    </div>
  );
}
