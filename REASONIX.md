# REASONIX.md

## Stack

- **Language:** HTML, vanilla JavaScript, CSS
- **CSS framework:** Tailwind CSS 3 (CDN-loaded via `<script>` tag)
- **Animations:** GSAP 3.12 + ScrollTrigger (CDN)
- **3D background:** Three.js r128 (CDN)
- **Icons:** Lucide (CDN-loaded via `<script src="...">` + `lucide.createIcons()`)

No build pipeline, no package manager, no bundler.

## Layout

- `/personal_website.html` — single-file portfolio (1075 lines). HTML + embedded `<style>` + inline `<script>` all in one file.
- `/images/avatar.jpg` — profile photo used in the About section.

No other source files, no config files, no `package.json`.

## Commands

No build, test, lint, format, typecheck, or dev commands exist. The site is a plain `.html` opened directly in a browser.

## Conventions

- **Monolith:** all markup, styles, and logic live in one HTML file — no CSS/JS imports or modules.
- **Language:** page content is in Chinese (Simplified).
- **CDN-first:** all dependencies loaded via `<link>` / `<script>` from CDN (Google Fonts, Tailwind, GSAP, Three.js, Lucide).
- **Custom cursor:** a `cursor` + `cursor-dot` div pair overrides the native cursor; all elements with `magnetic-target` class trigger a scale effect on hover.
- **GSAP ScrollTrigger:** sections are animated on scroll via `gsap.from()` calls triggered by ScrollTrigger at `top 80%` / `top 85%`.

## Watch out for

- **CDN availability** — site breaks without internet (Tailwind, GSAP, Three.js, Lucide, Google Fonts all load remotely).
- **No package-lock / version pinning** — CDN versions are set in the HTML (`r128` for Three.js, `3.12.2` for GSAP). Updating them requires a manual URL change.
- **Twitter link** uses a placeholder URL (`twitter.com/yourusername`) — needs updating before publishing.
- **No responsive testing** beyond the built-in Tailwind breakpoints and a mobile menu toggle; edge cases on very small or very large viewports aren't tested.
