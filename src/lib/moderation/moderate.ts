import type { ModerationResult } from './types';

const OPENAI_MODERATION_URL = 'https://api.openai.com/v1/moderations';

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY environment variable is not set');
  return key;
}

export async function moderateText(text: string): Promise<ModerationResult> {
  const response = await fetch(OPENAI_MODERATION_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'omni-moderation-latest',
      input: [{ type: 'text', text }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Moderation API request failed: ${response.status}`);
  }

  const data = await response.json();
  const result = data.results[0];

  return {
    flagged: result.flagged,
    categories: result.categories,
    scores: result.category_scores,
  };
}

export async function moderateImage(
  base64: string,
  mimeType: string,
): Promise<ModerationResult> {
  const response = await fetch(OPENAI_MODERATION_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'omni-moderation-latest',
      input: [{
        type: 'image_url',
        image_url: { url: `data:${mimeType};base64,${base64}` },
      }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Moderation API request failed: ${response.status}`);
  }

  const data = await response.json();
  const result = data.results[0];

  return {
    flagged: result.flagged,
    categories: result.categories,
    scores: result.category_scores,
  };
}
