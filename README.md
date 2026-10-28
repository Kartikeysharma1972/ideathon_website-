# MNIT × Codevidhya Ideathon 2026

A responsive, buildless landing page. A scroll-driven 3D classroom opens the page, a pencil replaces the mouse cursor, plus scroll reveals, animated counters, accessible category tabs, mobile navigation, FAQs and registration information dialog. No runtime dependencies or package install required. Reduced-motion preferences are respected. Google Fonts have local system fallbacks.

## The classroom tour

`dist/classroom.js` (Three.js 0.160 from jsDelivr via an import map, no build step) renders a stylised Indian classroom inside a pinned `#classroom` section that is 820vh tall. As you scroll, the camera walks one path through seven chapters: the door, the back bench, the rows (an idea bulb pops over a student), the blackboard (the three rounds are chalk-written onto it), the mentor at a student's desk, the student's notebook (the starter-kit ticks draw in) and finally the view from the board with every hand raised. All motion is keyed to a single eased "story clock" from scroll position, with holds at each chapter. The HTML chapter cards in `#classroom` are the real content; the canvas is decorative.

To retune a camera shot, edit `SHOTS` (and `PORTRAIT` for phones) in `classroom.js`; the teacher's path is `TK`. Board text lives in `scenes`. If WebGL or the CDN is unavailable the chapters fall back to stacked cards (`cr-fallback`). With reduced motion or motion toggled off, the camera cuts between chapters instead of travelling.

The pencil cursor (fine pointers only) hides the system cursor; its graphite tip is the hotspot. It tilts over interactive elements and leaves a small ring on click. It steps aside while the registration dialog is open.

## Enhanced effects

`dist/effects.css` and `dist/effects.js` add a pointer-responsive hero constellation, holographic orbit rings, a 3D particle playground with sphere/torus/helix morphs and three inspiration prompts, pencil spark trails, magnetic buttons, pointer-lit tilted round cards, scroll-illuminated typography, mentor orbit motion and video/CTA lighting. These are interactive visual effects, not a connected AI service. The playground runs in canvas with bounded particle counts and sparse linear mesh connections. Animation work stops outside relevant viewports and while the document is hidden. A persistent motion toggle and the operating system's reduced-motion preference control the experience. The native scroll behavior stays intact.

The four user-supplied illustrations are integrated through `dist/artwork.css`: `hero-idea.png` in the hero, `mentorship-lab.png` in the mentorship section, `round-illustrations.png` displayed through three CSS sprite windows, and `how-to-apply-poster.png` in the video placeholder. Original image pixels and transparency are preserved. The hero loads with high priority; lower-page images load lazily. The mentorship image is an imagined scene, and the video remains marked coming soon. `IMAGE_PROMPTS.md` retains the original art direction and generation briefs.

## Preview

Run `npm run dev` in this directory, then open http://localhost:4173. Run `npm run check` to check the browser JavaScript syntax. Publishable files are in `dist/`.

## Content

Based on the supplied MNIT proposal PDF and the October 27, 2026 workflow DOCX. The later document's three-round structure takes precedence. Dates, fees, final test specifications and registration link are not confirmed. No deadline, prize amount, open-registration claim or submission backend is invented. Reach figures refer to Codevidhya's reported reach, not this event's registrations.

## Adding the video

Replace the inside of `#application-video` in `dist/index.html` with your video element or embed. Keep the 16:9 container. Use controls and an accessible title; do not autoplay audio. For a local MP4, add it to `dist/assets/` and use `<video controls preload="metadata" style="width:100%;height:100%" aria-label="How to apply for Ideathon 2026"><source src="assets/how-to-apply.mp4" type="video/mp4"></video>`. Add captions when the video is available.

## Opening registration

Replace the `data-open-registration` button in `#apply` with an anchor to the confirmed application URL, update the registration status copy and corresponding FAQ, and remove the unused dialog listeners if removing the dialog. Contact email comes from the supplied PDF.
