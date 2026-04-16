export type ModerationStatus = 'pending' | 'approved' | 'rejected' | 'flagged_for_review';

export interface ModerationScores {
  sexual: number;
  'sexual/minors': number;
  harassment: number;
  'harassment/threatening': number;
  hate: number;
  'hate/threatening': number;
  illicit: number;
  'illicit/violent': number;
  'self-harm': number;
  'self-harm/intent': number;
  'self-harm/instructions': number;
  violence: number;
  'violence/graphic': number;
}

export interface ModerationResult {
  flagged: boolean;
  categories: Record<string, boolean>;
  scores: ModerationScores;
}
