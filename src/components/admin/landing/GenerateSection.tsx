'use client';

interface GenerateSectionProps {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  hasBlocks: boolean;
  onGenerate: () => void;
  isGenerating: boolean;
}

export default function GenerateSection({
  prompt,
  onPromptChange,
  hasBlocks,
  onGenerate,
  isGenerating,
}: GenerateSectionProps) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        AI Generation
      </label>
      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder="Describe your landing page..."
        rows={3}
        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
      />
      <button
        type="button"
        onClick={onGenerate}
        disabled={isGenerating || !prompt.trim()}
        className="text-sm bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isGenerating ? 'Generating...' : hasBlocks ? 'Regenerate' : 'Generate'}
      </button>
    </div>
  );
}
