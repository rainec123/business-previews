export interface EmailData {
  businessName: string;
  firstName: string | null;
  previewUrl: string;
  city: string;
  fromName: string;
}

/**
 * Subject line for the cold email.
 */
export function buildSubject(businessName: string): string {
  return `We built ${businessName} a website — take a look`;
}

/**
 * Plain text version of the email.
 */
export function buildPlainText(data: EmailData): string {
  const greeting = data.firstName ? `Hi ${data.firstName},` : 'Hi there,';

  return `${greeting}

I noticed ${data.businessName} doesn't have a website yet — so I put one together for you.

Take a look: ${data.previewUrl}

Took us about 10 minutes using your Google listing info. We think it looks pretty solid.

If you're happy with the design, we can fully build it out — custom domain, hosting, everything set up — for a simple one-time fee. No monthly subscriptions, no ongoing costs, no tech headaches.

No pressure at all — just reply if you're keen and we can have a chat about it.

Cheers,
${data.fromName}

---
You're receiving this because ${data.businessName} doesn't have a website yet.
If you already have one or aren't interested, just ignore this — no hard feelings.
`;
}

/**
 * HTML version of the email.
 */
export function buildHtml(data: EmailData): string {
  const greeting = data.firstName ? `Hi ${data.firstName},` : 'Hi there,';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; line-height: 1.6; margin: 0; padding: 0; background: #f5f5f5; }
    .wrapper { max-width: 560px; margin: 32px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    .header { background: #111; padding: 24px 32px; }
    .header-logo { color: #fff; font-size: 18px; font-weight: 700; letter-spacing: -0.5px; }
    .body { padding: 32px; }
    p { margin: 0 0 16px; font-size: 15px; }
    .preview-box { background: #f8f8f8; border: 1px solid #e5e5e5; border-radius: 8px; padding: 20px 24px; margin: 24px 0; text-align: center; }
    .preview-label { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 8px; }
    .preview-url { font-size: 14px; font-weight: 600; color: #0066cc; word-break: break-all; }
    .cta { display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 15px; font-weight: 600; margin: 8px 0; }
    .footer { padding: 20px 32px; border-top: 1px solid #eee; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="header-logo">${data.fromName}</div>
    </div>
    <div class="body">
      <p>${greeting}</p>
      <p>I noticed <strong>${data.businessName}</strong> doesn't have a website yet — so I put one together for you.</p>
      <div class="preview-box">
        <div class="preview-label">Your free preview</div>
        <div class="preview-url">${data.previewUrl}</div>
      </div>
      <p style="text-align:center">
        <a href="${data.previewUrl}" class="cta">View Your Preview Site →</a>
      </p>
      <p>Took us about 10 minutes using your Google listing info. We think it looks pretty solid.</p>
      <p>If you're happy with the design, we can fully build it out — <strong>custom domain, hosting, everything set up</strong> — for a simple one-time fee. No monthly subscriptions, no ongoing costs, no tech headaches.</p>
      <p>No pressure at all — just reply if you're keen and we can have a chat.</p>
      <p>Cheers,<br><strong>${data.fromName}</strong></p>
    </div>
    <div class="footer">
      You're receiving this because ${data.businessName} doesn't have a website yet.
      If you already have one or aren't interested, just ignore this — no hard feelings.
    </div>
  </div>
</body>
</html>`;
}
