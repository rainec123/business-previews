import axios from 'axios';
import path from 'path';
import fs from 'fs';
import slugify from 'slugify';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

const SITES_DIR = path.join(process.cwd(), 'data', 'sites');
fs.mkdirSync(SITES_DIR, { recursive: true });

const GH_API = 'https://api.github.com';

/** Convert a business name to a URL-safe slug. */
export function toSlug(name: string): string {
  return slugify(name, { lower: true, strict: true, trim: true });
}

/** Base64-encode a string for the GitHub API. */
function toBase64(content: string): string {
  return Buffer.from(content, 'utf-8').toString('base64');
}

/** GitHub API headers. */
function ghHeaders() {
  return {
    Authorization: `Bearer ${config.githubToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/**
 * Ensure the GitHub repo has GitHub Pages enabled on the gh-pages branch.
 * Safe to call multiple times — idempotent.
 */
async function ensureGitHubPages(): Promise<void> {
  try {
    // Check if gh-pages branch exists
    await axios.get(
      `${GH_API}/repos/${config.githubOwner}/${config.githubRepo}/branches/gh-pages`,
      { headers: ghHeaders(), timeout: 10_000 },
    );
  } catch {
    // Branch doesn't exist — create it with an index.html
    logger.info('Creating gh-pages branch...');

    // Get the default branch SHA to base gh-pages off
    const repoRes = await axios.get(
      `${GH_API}/repos/${config.githubOwner}/${config.githubRepo}`,
      { headers: ghHeaders(), timeout: 10_000 },
    );
    const defaultBranch: string = repoRes.data.default_branch;

    const branchRes = await axios.get(
      `${GH_API}/repos/${config.githubOwner}/${config.githubRepo}/branches/${defaultBranch}`,
      { headers: ghHeaders(), timeout: 10_000 },
    );
    const sha: string = branchRes.data.commit.sha;

    // Create gh-pages branch
    await axios.post(
      `${GH_API}/repos/${config.githubOwner}/${config.githubRepo}/git/refs`,
      { ref: 'refs/heads/gh-pages', sha },
      { headers: ghHeaders(), timeout: 10_000 },
    );

    // Push a root index.html so GitHub Pages activates
    await pushFile(
      'index.html',
      '<html><body><h1>Preview sites</h1></body></html>',
      'chore: initialise gh-pages',
    );

    // Enable GitHub Pages via API
    await axios.post(
      `${GH_API}/repos/${config.githubOwner}/${config.githubRepo}/pages`,
      { source: { branch: 'gh-pages', path: '/' } },
      { headers: ghHeaders(), timeout: 10_000 },
    ).catch(() => {
      // May already be enabled or require manual activation — non-fatal
      logger.warn('GitHub Pages API call failed — you may need to enable it manually in repo Settings → Pages.');
    });
  }
}

/**
 * Push a single file to the gh-pages branch via the GitHub Contents API.
 * Creates the file if it doesn't exist, updates it if it does.
 */
async function pushFile(filePath: string, content: string, message: string): Promise<void> {
  const url = `${GH_API}/repos/${config.githubOwner}/${config.githubRepo}/contents/${filePath}`;

  // Check if file already exists (need its SHA to update)
  let existingSha: string | undefined;
  try {
    const existing = await axios.get(url, {
      headers: { ...ghHeaders(), ref: 'gh-pages' },
      params: { ref: 'gh-pages' },
      timeout: 10_000,
    });
    existingSha = existing.data.sha as string;
  } catch {
    // File doesn't exist yet — that's fine
  }

  await axios.put(
    url,
    {
      message,
      content: toBase64(content),
      branch: 'gh-pages',
      ...(existingSha ? { sha: existingSha } : {}),
    },
    { headers: ghHeaders(), timeout: 15_000 },
  );
}

/**
 * Deploy an HTML preview page to GitHub Pages.
 * Returns the public URL for that specific preview page.
 */
export async function deploySite(
  businessName: string,
  html: string,
  maxRetries = 3,
): Promise<string> {
  const slug = toSlug(businessName);
  const filePath = `preview/${slug}/index.html`;
  logger.info(`Deploying preview for "${businessName}" to GitHub Pages (${filePath})...`);

  // Save locally too
  const localPath = path.join(SITES_DIR, `${slug}.html`);
  fs.writeFileSync(localPath, html, 'utf-8');

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await ensureGitHubPages();
      await pushFile(filePath, html, `feat: add preview for ${businessName}`);

      const previewUrl = `https://${config.githubOwner}.github.io/${config.githubRepo}/preview/${slug}`;
      logger.info(`Site live at: ${previewUrl}`);
      return previewUrl;
    } catch (err) {
      lastError = err as Error;
      logger.warn(`Deploy attempt ${attempt}/${maxRetries} failed: ${lastError.message}`);
      if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 4000 * attempt));
    }
  }

  throw lastError ?? new Error('GitHub Pages deployment failed after all retries.');
}
