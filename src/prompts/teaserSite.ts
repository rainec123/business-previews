import { EnrichedBusiness } from '../pipeline/researchBusiness';

export const SYSTEM_PROMPT = `You are an expert web designer who specialises in creating beautiful,
conversion-focused websites for local businesses. You write clean, modern HTML/CSS
with an eye for design. You never produce generic templates — every site you create
feels handcrafted for that specific business. You have perfect taste.`;

export function buildTeaserPrompt(business: EnrichedBusiness): string {
  return `Create a stunning one-page preview website for this business. Use EVERY piece of
information provided to make it feel completely personalised — not templated.

BUSINESS DATA:
${JSON.stringify(business, null, 2)}

DESIGN REQUIREMENTS:

1. COLOUR SCHEME — Infer from the business type and vibe:
   - Restaurant (upscale): deep navy + gold + cream
   - Restaurant (casual/family): warm red or orange + white
   - Cafe / coffee shop: warm browns + sage green + cream
   - Pilates / yoga studio: soft dusty rose + sage + white
   - Gym / CrossFit / PT: dark charcoal + electric blue or neon green
   - Hair salon / beauty: blush pink + black + gold
   - Plumber / electrician / trades: strong blue or dark navy + white + orange accent
   - Law firm / accountant: deep charcoal + gold + white
   - Children's services / daycare: bright primary colours, playful fonts
   - Landscaping / gardening: forest green + earthy tan + white
   - Medical / dental / allied health: clean white + teal + light grey
   - Real estate: dark grey + gold + white
   - Bakery / patisserie: warm cream + chocolate brown + dusty rose
   - Adapt intelligently for anything not listed — use the vibe keywords and review sentiment

2. TYPOGRAPHY:
   - Import 2 Google Fonts that match the vibe (use @import in <style> tag)
   - Upscale / elegant: Playfair Display + Lato
   - Modern / minimal: Inter (weights 300, 400, 600, 700 only)
   - Warm / artisan: Fraunces + Nunito
   - Bold / athletic: Oswald + Open Sans
   - Playful / family: Poppins + Nunito
   - Choose appropriately — never use default system fonts

3. STICKY BANNER:
   - A sticky bar fixed to the TOP of the viewport
   - Background: a contrasting accent colour (e.g. amber, coral, or electric blue)
   - Text: "⚡ This is a free preview — reply to claim & customise your site"
   - Text should be centred, bold, white, font-size 13px
   - z-index: 9999
   - Add padding-top to the body so content isn't hidden under it

4. SECTIONS TO INCLUDE (in this order):

   a) HERO SECTION
   - Full-viewport height (100vh minus banner height)
   - If photos are available: embed the first photo as base64 background-image with a dark gradient overlay (linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.4)))
   - If no photos: use a rich multi-stop gradient background based on their colour scheme
   - Craft a REAL tagline for this business based on their vibe and USPs — NOT just their business name
     Examples: "Auckland's Favourite Wood-Fired Pizza" | "Where Strength Meets Flexibility" | "Your Neighbourhood Plumber, Done Right"
   - Subheading: 1-2 sentences using their actual information (rating, review highlights, specialty)
   - Two CTA buttons with smooth scroll: "Explore" (scrolls to about/services) + "Get In Touch" (scrolls to contact)
   - If they have an Instagram handle: show it with an SVG Instagram icon
   - Animated text or subtle fade-in via CSS animation

   b) ABOUT / STORY SECTION
   - Light background (cream or very light grey)
   - Write 2-3 genuine-feeling paragraphs using: editorial summary, Instagram bio, review sentiment, and category
   - Use first-person or third-person naturally — avoid "we are pleased to offer" corporate-speak
   - Include a rating badge if rating > 4.0: "★ {rating}/5 from {reviewCount}+ reviews"
   - If there are top review quotes, pull ONE real quote into a styled blockquote

   c) SERVICES / MENU SECTION
   - Dark or accent background
   - If restaurant/cafe: show menu items in a grid of 6-9 cards (dish name + short enticing description, inferred if needed)
   - If service business: show 4-6 service cards (icon SVG + service name + 1-sentence description)
   - Make service names and descriptions SPECIFIC to their actual business type — not generic
   - Include pricing if price level is available (e.g. "From $X" or use price symbols)
   - CSS grid layout, cards with subtle hover effect

   d) TESTIMONIALS / SOCIAL PROOF (only if reviews are available)
   - Light background
   - Show 2-3 review cards with: star rating, quote, author name
   - Clean card design with subtle shadow

   e) CONTACT SECTION
   - Accent or dark background
   - Business name + formatted phone (clickable tel: link)
   - Full address
   - Opening hours formatted as a clean table/list
   - If Instagram: link to @handle
   - Google Maps embed placeholder (show a styled map-pin SVG instead of actual embed)
   - "Get Directions" button (links to https://maps.google.com/?q={encoded address})

5. FOOTER
   - Small, dark footer
   - Business name + copyright year
   - "Website preview by [Agency Name]" in small grey text

6. TECHNICAL REQUIREMENTS:
   - Single self-contained HTML file — ALL CSS inline in <style> tag, NO external JS libraries
   - Mobile-first responsive design using CSS Grid and Flexbox
   - Smooth scroll behaviour (scroll-behavior: smooth on html)
   - All images embedded as base64 data URIs if provided — never reference external URLs
   - CSS custom properties (variables) for the colour scheme
   - Subtle CSS animations: fade-in on scroll using @keyframes + IntersectionObserver (vanilla JS, inline)
   - No Lorem Ipsum — every word of copy must be grounded in the real business data provided

CRITICAL: Return ONLY the complete HTML. No explanation. No markdown fences. No backticks.
Start your response with <!DOCTYPE html> and end with </html>.`;
}
