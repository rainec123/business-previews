import Anthropic from '@anthropic-ai/sdk';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { EnrichedBusiness } from './researchBusiness';
import { SYSTEM_PROMPT, buildTeaserPrompt } from '../prompts/teaserSite';

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

/**
 * Strip any markdown code fences from Claude's response in case it wraps HTML.
 * Claude is instructed not to add them, but this is a safety net.
 */
function extractHtml(raw: string): string {
  // Remove ```html ... ``` or ``` ... ``` wrappers
  const fenced = raw.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  // If it starts with <!DOCTYPE, it's clean
  const doctypeIndex = raw.indexOf('<!DOCTYPE');
  if (doctypeIndex !== -1) return raw.slice(doctypeIndex).trim();

  const htmlIndex = raw.indexOf('<html');
  if (htmlIndex !== -1) return raw.slice(htmlIndex).trim();

  return raw.trim();
}

/**
 * Call the Claude API to generate a personalised one-page HTML website
 * for the given enriched business object.
 */
export async function generateSite(business: EnrichedBusiness): Promise<string> {
  logger.info(`Generating site for "${business.name}" via Claude...`);

  // Strip base64 photos from the prompt payload to keep it within token limits.
  // We pass a flag instead so Claude knows photos are available.
  const businessForPrompt = {
    ...business,
    photos: business.photos.length > 0
      ? [`[${business.photos.length} photo(s) available — use first as hero background]`, ...business.photos.slice(0, 1)]
      : [],
  } as unknown as EnrichedBusiness;

  const userPrompt = buildTeaserPrompt(businessForPrompt);

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 4000,
    temperature: 0.7,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const rawText = response.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as { type: 'text'; text: string }).text)
    .join('');

  const html = extractHtml(rawText);

  if (!html.includes('<html') && !html.includes('<!DOCTYPE')) {
    throw new Error(`Claude did not return valid HTML. Response preview: ${rawText.slice(0, 200)}`);
  }

  logger.info(`Site generated for "${business.name}" — ${html.length} characters.`);
  return html;
}
