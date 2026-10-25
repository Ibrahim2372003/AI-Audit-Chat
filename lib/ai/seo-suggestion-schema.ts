import { z } from 'zod';

const suggestionText = {
  title: z.string().trim().min(10).max(60),
  description: z.string().trim().min(50).max(160),
};

export const SeoSuggestionContentSchema = z
  .object({
    title: z.object({
      suggested: suggestionText.title,
      rationale: z.string().trim().min(1).max(240),
    }).strict(),
    description: z.object({
      suggested: suggestionText.description,
      rationale: z.string().trim().min(1).max(240),
    }).strict(),
  })
  .strict();

export const SeoSuggestionsSchema = z
  .object({
    url: z.string().url().max(2048),
    title: z.object({
      current: z.string().max(2000).nullable(),
      suggested: suggestionText.title,
      rationale: z.string().trim().min(1).max(240),
    }).strict(),
    description: z.object({
      current: z.string().max(2000).nullable(),
      suggested: suggestionText.description,
      rationale: z.string().trim().min(1).max(240),
    }).strict(),
  })
  .strict();

export type SeoSuggestions = z.infer<typeof SeoSuggestionsSchema>;
