# Frontend UX Motion & Perceived Performance Review

**Theme:** Dawn-based Shopify theme (custom storefront sections layered on stock Dawn architecture)  
**Scope:** CSS, JS, and Liquid markup — animations, micro-interactions, image loading, CLS/jank  
**Constraint:** Respect Dawn’s HTML-first philosophy — prefer CSS transitions, existing `--duration-*` tokens, and native APIs (Intersection Observer) over third-party animation libraries.

---

## Executive summary

Dawn already ships a solid motion system: scroll-triggered fade/slide via `animations.js` + `IntersectionObserver`, duration tokens, `prefers-reduced-motion` guards, secondary-image card hover, and menu-drawer overlay fades.

Most UX polish gaps live in **custom homepage/PDP sections** that never opt into that system, **abrupt drawer/modal opens** (200ms panel-only), **invalid image dimension attributes** (CLS), and a few **JS bugs / heavy assets** that hurt perceived performance.

| Priority | Opportunity | Impact |
|----------|-------------|--------|
| High | Wire custom sections into `scroll-trigger` | Homepage feels polished without new JS |
| High | Fix invalid `width`/`height` + lazy-load gaps | Reduce CLS |
| High | Cart drawer overlay fade + ~320ms easing | Core commerce affordance |
| High | Reserve space for `cheaper-together` async paint | PDP CLS |
| High | Facets grid height lock + scroll-init bugfix | Collection filtering feels stable |
| Medium | Quick-add / modal opacity transitions | Product discovery polish |
| Medium | Enrich `custom-product-card` hover | Match stock card UX |
| Medium | Enable hover lift setting or light button micro-motion | Instant store-wide feedback |
| Medium | Accordion height animation | PDP content panels |
| Medium | Drop `blur()` from card-draw keyframes | Less GPU jank |
| Low | Predictive search fade / min-height | Search polish |
| Low | Align one-off section CSS with `--duration-*` | Consistency |

---

## 1. What Dawn already provides (reuse this)

### 1.1 Scroll reveal (`animations.js` + `base.css`)

Enabled when `settings.animations_reveal_on_scroll` is true (`config/settings_data.json` currently `true`). Script is loaded conditionally from `layout/theme.liquid`.

**How it works**

1. Mark elements with `scroll-trigger` + `animate--slide-in` or `animate--fade-in`.
2. `IntersectionObserver` toggles `scroll-trigger--offscreen`.
3. When in view, CSS runs `slideIn` / `fadeIn` (~600ms via `--duration-extra-long`).
4. Optional `data-cascade` + `--animation-order` staggers siblings by 75ms.

**Stock usage pattern** (e.g. featured collection / footer):

```liquid
<div
  class="grid__item{% if settings.animations_reveal_on_scroll %} scroll-trigger animate--slide-in{% endif %}"
  {% if settings.animations_reveal_on_scroll %}
    data-cascade
    style="--animation-order: {{ forloop.index }};"
  {% endif %}
>
```

### 1.2 Duration tokens (`base.css`)

```css
--duration-short: 100ms;
--duration-default: 200ms;      /* drawers/menus today — feels abrupt */
--duration-medium: 300ms;
--duration-long: 500ms;
--duration-extra-long: 600ms;   /* scroll reveals */
```

Prefer these over hard-coded `0.3s` / `all` transitions in custom CSS.

### 1.3 Hover element lifts (theme setting)

Body class is built as `animate--hover-{{ settings.animations_hover_elements }}`.

Current setting value: **`default`**.

That produces class `animate--hover-default`, which matches **neither** `.animate--hover-3d-lift` nor `.animate--hover-vertical-lift`. Stock card/button lift micro-interactions are effectively **off**.

**Quick win (no code):** Theme editor → Animations → Hover effects → **Vertical lift** or **3D lift**.

### 1.4 Stock product cards

`snippets/card-product.liquid` already has:

- Aspect-ratio reserved via `.media` / `--ratio-percent`
- `loading="lazy"`, real numeric `width`/`height`, `srcset`
- Secondary image swap + slight scale (`media--hover-effect` in `component-card.css`)

Reuse this snippet wherever possible instead of reinventing cards.

---

## 2. Smooth page / section load transitions

### Gap

These **custom sections do not use** `scroll-trigger` / `animate--*`, while stock Dawn sections do. Homepage experience is visually static compared to collection/blog pages:

| Section | File |
|---------|------|
| Benefits | `sections/benefits.liquid` |
| Special offers | `sections/special-offers.liquid` |
| Trending products | `sections/trending-products.liquid` |
| Products with banner | `sections/products-with-banner.liquid` |
| Sale banner | `sections/sale-banner.liquid` |
| All brands | `sections/all-brands.liquid` |
| Newsletter + newfeed | `sections/newsletter-with-newfeed.liquid` |
| Collections showcase | `sections/collections-showcase.liquid` / `collection-showcase.liquid` |
| Highlight image | `sections/highlight-image.liquid` |
| Card-draw banner slider | `sections/card-draw-banner-slider.liquid` (has its own blur-heavy keyframes instead) |

### Implementation steps

#### Step A — Opt sections into Dawn’s system (preferred)

Example for `benefits.liquid`:

```liquid
{% for block in section.blocks %}
  <div
    class="benefits__content{% if settings.animations_reveal_on_scroll %} scroll-trigger animate--slide-in{% endif %}"
    {% if settings.animations_reveal_on_scroll %}
      data-cascade
      style="--animation-order: {{ forloop.index }};"
    {% endif %}
    {{ block.shopify_attributes }}
  >
    {%- comment -%} existing icon + title markup {%- endcomment -%}
  </div>
{% endfor %}
```

For whole-section wrappers (sale banner, newsletter blocks):

```liquid
<section
  class="sale-banner{% if settings.animations_reveal_on_scroll %} scroll-trigger animate--fade-in{% endif %}"
>
```

**Why this is better than a custom library**

- Zero new JS — reuses `animations.js` already gated by theme settings
- Respects `prefers-reduced-motion` and Theme Editor design mode
- Cascade delay gives a “list settling in” feel on product grids

#### Step B — Optional shared utility for non-section nodes

Only if you need reveals outside the setting flag (e.g. predictive results). Prefer IO over scroll listeners:

```js
// assets/soft-reveal.js — only if truly needed beyond scroll-trigger
class SoftReveal {
  static init(root = document) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const nodes = root.querySelectorAll('[data-reveal]');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -40px 0px' });
    nodes.forEach((n) => io.observe(n));
  }
}
document.addEventListener('DOMContentLoaded', () => SoftReveal.init());
```

```css
[data-reveal] {
  opacity: 0.01;
  transform: translateY(1.25rem);
  transition:
    opacity var(--duration-extra-long) var(--ease-out-slow),
    transform var(--duration-extra-long) var(--ease-out-slow);
}
[data-reveal].is-revealed {
  opacity: 1;
  transform: none;
}
```

**Recommendation:** Prefer Step A for all theme sections; reserve Step B for dynamic HTML injected after load.

---

## 3. Hover state micro-interactions

### 3.1 Enable built-in lifts (fastest)

Set `animations_hover_elements` to `vertical-lift` or `3d-lift` in Theme settings (or `config/settings_data.json` for local defaults).

Vertical lift is lighter and usually more brand-neutral for ecommerce:

```json
"animations_hover_elements": "vertical-lift"
```

### 3.2 Custom product cards lack card/image hover

`snippets/custom-product-card.liquid` + `assets/custom-product-card.css` only animate the cart button background/fill. No image scale, secondary media, or card elevation.

**Proposed CSS** (`custom-product-card.css`):

```css
.custom-products__image-wrapper {
  aspect-ratio: 1 / 1;
  overflow: hidden;
  position: relative;
  border-radius: 8px; /* match existing card language if desired */
}

.custom-products__image-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform var(--duration-long) ease;
}

@media (hover: hover) and (prefers-reduced-motion: no-preference) {
  .custom-products__card:hover .custom-products__image-wrapper img {
    transform: scale(1.03);
  }

  .custom-products__card {
    transition:
      transform var(--duration-medium) var(--ease-out-slow),
      box-shadow var(--duration-medium) ease;
  }

  .custom-products__card:hover {
    transform: translateY(-0.4rem);
  }

  .custom-product__cart button:active {
    transform: scale(0.96);
  }
}

.custom-product__cart button {
  transition:
    background-color var(--duration-default) ease,
    transform var(--duration-short) ease;
}
```

Avoid `transition: all` (present today) — it forces browsers to animate every property and can cause unexpected layout paints.

### 3.3 Stock secondary-image opacity snap

In `component-card.css`, hover fade for the *first* image when a second image exists is effectively instant (opacity jumps). Optional polish:

```css
@media screen and (min-width: 990px) {
  .card .media.media--hover-effect > img:first-child:not(:only-child) {
    transition:
      opacity var(--duration-long) ease,
      transform var(--duration-long) ease;
  }
}
```

### 3.4 Buttons & header icons

If you keep hover lifts at `default`, add a light shared micro-interaction using Dawn tokens:

```css
@media (hover: hover) and (prefers-reduced-motion: no-preference) {
  .button:not(.button--tertiary):not([disabled]):hover {
    transform: translateY(-0.15rem);
  }
  .button:not(.button--tertiary):not([disabled]):active {
    transform: translateY(0);
  }
}

.button {
  transition:
    box-shadow var(--duration-short) ease,
    transform var(--duration-default) var(--ease-out-slow),
    background-color var(--duration-short) ease;
}
```

`header-bottom.css` already fades mega-menu with opacity + `translateY` (~0.3s) — treat that as the reference for other nav surfaces. `header-custom.css` is layout-only; icon buttons would benefit from the same short opacity/opacity+scale pattern used on menu-drawer account icons.

---

## 4. Drawers, modals, and accordions

### 4.1 Cart drawer — panel slides, overlay does not fade

**Current** (`component-cart-drawer.css`):

- `.drawer` uses a solid dimmed background and only transitions `visibility`
- `.drawer__inner` translates in over `--duration-default` (200ms)
- `.cart-drawer__overlay` has no opacity transition
- `cart-drawer.js` needs a `setTimeout` so the open animation consistently fires

Menu drawer already fades its overlay — cart should match that quality bar.

**Proposed CSS**

```css
:root {
  --duration-drawer: var(--duration-medium); /* 300ms — or 320ms custom */
}

.drawer {
  background-color: transparent; /* move dim to overlay */
  transition: visibility var(--duration-drawer) ease;
}

.drawer:not(.active) {
  visibility: hidden;
}

.cart-drawer__overlay {
  background-color: rgba(var(--color-foreground), 0.5);
  opacity: 0;
  transition: opacity var(--duration-drawer) ease;
  pointer-events: none;
}

.drawer.active .cart-drawer__overlay {
  opacity: 1;
  pointer-events: auto;
}

.drawer__inner {
  transform: translateX(100%);
  transition: transform var(--duration-drawer) cubic-bezier(0.25, 0.46, 0.45, 0.94);
  will-change: transform;
}

.drawer.active .drawer__inner {
  transform: translateX(0);
}

@media (prefers-reduced-motion: reduce) {
  .drawer__inner,
  .cart-drawer__overlay {
    transition: none;
  }
}
```

**JS note:** Keep the existing `requestAnimationFrame`/`setTimeout` open pattern so the browser applies the starting `translateX(100%)` before adding `.active`. Prefer `requestAnimationFrame` double-tick over bare `setTimeout` when tightening:

```js
open(triggeredBy) {
  if (triggeredBy) this.setActiveElement(triggeredBy);
  // force starting styles to paint, then animate
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      this.classList.add('animate', 'active');
    });
  });
  // ... existing transitionend focus trap ...
}
```

**UX gain:** Overlay and panel feel coordinated; 300ms reads as intentional rather than snappy/broken.

### 4.2 Quick-add / ModalDialog — opacity snaps

`assets/quick-add.css` toggles opacity/visibility with **no transition**. `ModalDialog` in `global.js` sets/removes `[open]` immediately.

```css
.quick-add-modal {
  opacity: 0;
  visibility: hidden;
  transition:
    opacity var(--duration-drawer, 300ms) ease,
    visibility var(--duration-drawer, 300ms) ease;
}

.quick-add-modal[open] {
  opacity: 1;
  visibility: visible;
  z-index: 101;
}

.quick-add-modal__content {
  transform: translate(-50%, 1rem);
  transition: transform var(--duration-drawer, 300ms) var(--ease-out-slow);
}

.quick-add-modal[open] .quick-add-modal__content {
  transform: translate(-50%, 0);
}
```

For close animations with attribute removal, either:

- Delay `removeAttribute('open')` until `transitionend`, or
- Use a class `.is-closing` before removing `[open]`

```js
// illustrative pattern inside ModalDialog.hide()
hide() {
  if (this.hasAttribute('open') === false) return;
  this.classList.add('is-closing');
  const onEnd = (event) => {
    if (event.target !== this) return;
    this.classList.remove('is-closing');
    this.removeAttribute('open');
    this.removeEventListener('transitionend', onEnd);
  };
  this.addEventListener('transitionend', onEnd);
  // styles: .quick-add-modal.is-closing { opacity: 0; }
  document.body.classList.remove('overflow-hidden');
  removeTrapFocus(this.openedBy);
  window.pauseAllMedia();
}
```

### 4.3 Accordions — instant open/close

`component-accordion.css` rotates the caret but content appears/disappears with native `<details>` — no height animation.

**Modern CSS approach** (no library):

```css
.accordion details {
  interpolate-size: allow-keywords; /* progressive enhancement */
}

.accordion__content {
  margin-bottom: 1.5rem;
  overflow: hidden;
}

@media (prefers-reduced-motion: no-preference) {
  .accordion details::details-content {
    transition:
      content-visibility 280ms allow-discrete,
      height 280ms ease;
    height: 0;
  }

  .accordion details[open]::details-content {
    height: auto;
  }
}
```

**Fallback** if browser support is uneven: wrap inner content and animate `grid-template-rows: 0fr → 1fr`, keeping caret transition as today. Always honor `prefers-reduced-motion`.

### 4.4 Predictive search

Results currently land via `innerHTML` with no entrance motion. Soft fade:

```css
.predictive-search__results-list {
  animation: fadeIn var(--duration-medium) var(--ease-out-slow);
}

@media (prefers-reduced-motion: reduce) {
  .predictive-search__results-list { animation: none; }
}
```

Reserve a small `min-height` on the results container while loading to reduce layout jump.

---

## 5. Optimized image loading

### 5.1 Invalid `width` / `height` attributes (CLS risk — High)

HTML `width`/`height` must be **unitless integers**. Values like `420px`, `full`, or `300px` are ignored by browsers → no intrinsic aspect ratio → layout shifts when images decode.

| File | Problem |
|------|---------|
| `sections/header-bottom.liquid` | `width="full"` `height="300px"` |
| `sections/sale-banner.liquid` | `width="420px"` `height="252px"` |
| `sections/products-with-banner.liquid` | `width="416px"` `height="535px"` |
| `sections/collection-showcase.liquid` | `500px` / `400px` units |
| `sections/all-brands.liquid` | `164px` / `80px` |
| `sections/newsletter-with-newfeed.liquid` | `140px` / `86px` (+ icon sizes) |

**Fix pattern**

```liquid
{{
  image
  | image_url: width: 840
  | image_tag:
    widths: '420, 840',
    sizes: '(min-width: 750px) 420px, 100vw',
    loading: 'lazy',
    widths: '420, 840',
    class: 'sale-banner__image'
}}
```

Or for plain `<img>`:

```html
<img
  src="{{ image | image_url: width: 840 }}"
  alt="{{ image.alt | escape }}"
  width="420"
  height="252"
  loading="lazy"
  style="width: 100%; height: auto;"
>
```

Prefer Shopify’s `image_tag` filter — it emits correct dimensions and `srcset` automatically.

### 5.2 Missing lazy loading

Add `loading="lazy"` (or `image_tag` with `loading: 'lazy'`) to below-the-fold images in:

- `all-brands.liquid`
- `collections-showcase.liquid` / `collection-showcase.liquid`
- `header-bottom.liquid` (promo images not in first viewport)
- `highlight-image.liquid`
- Banner sections where the image is not LCP

**Keep eager** for true LCP candidates (first hero/banner above the fold).

### 5.3 Image fade-in on load (perceived smoothness)

Lightweight pattern; no library:

```css
img[loading='lazy'] {
  opacity: 0;
  transition: opacity var(--duration-long) ease;
}

img[loading='lazy'].is-loaded,
img[loading='lazy']:not([data-fade]) {
  /* opt-in with data-fade to avoid fighting LCP hero */
}

img[data-fade] {
  opacity: 0;
  transition: opacity var(--duration-long) ease;
}

img[data-fade].is-loaded {
  opacity: 1;
}
```

```js
document.querySelectorAll('img[data-fade]').forEach((img) => {
  if (img.complete) {
    img.classList.add('is-loaded');
    return;
  }
  img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
});
```

Pair with reserved aspect-ratio boxes so opacity fade never causes CLS.

### 5.4 Custom card media box

Even with numeric 400×400 attrs, CSS should reserve space:

```css
.custom-products__image-wrapper {
  aspect-ratio: 1 / 1;
  background: rgba(var(--color-foreground), 0.04); /* subtle placeholder */
}
```

---

## 6. Layout shift (CLS) and jank — findings & refactors

### 6.1 Facets product grid swap (High)

`assets/facets.js` replaces `#ProductGridContainer` via `innerHTML`. Grid height collapses to 0 momentarily then expands → visible jump.

Also:

```js
initializeScrollAnimationTrigger(html.innerHTML);
```

Here `html` is a **string** (`responseText`), so `html.innerHTML` is `undefined`. Scroll animations on filtered grids never re-init correctly (cancel class is applied afterward, which is fine for filters, but the call is still buggy).

**Refactor**

```js
static renderProductGridContainer(html) {
  const container = document.getElementById('ProductGridContainer');
  const previousHeight = container.offsetHeight;
  container.style.minHeight = `${previousHeight}px`;

  const parsed = new DOMParser().parseFromString(html, 'text/html');
  container.innerHTML = parsed.getElementById('ProductGridContainer').innerHTML;

  container.querySelectorAll('.scroll-trigger').forEach((element) => {
    element.classList.add('scroll-trigger--cancel');
  });

  requestAnimationFrame(() => {
    container.style.minHeight = '';
  });
}

// In fetch/cache paths — pass a Document, or remove the broken call:
const doc = new DOMParser().parseFromString(html, 'text/html');
if (typeof initializeScrollAnimationTrigger === 'function') {
  initializeScrollAnimationTrigger(doc);
}
```

Optional progressive enhancement: wrap filter updates in the View Transitions API when available (`document.startViewTransition(() => { ... })`) for a cross-fade between old/new grids.

### 6.2 `cheaper-together` async Shadow DOM (High)

`sections/cheaper-together.liquid` renders an empty `<cheaper-together>` custom element, then fetches product JSON and injects HTML into a Shadow root. Until fetches complete, the section has almost no height → large late layout on PDP.

**Refactor options**

1. **Server-render** related products in Liquid (preferred — HTML-first, no flash).
2. Or reserve space + skeleton:

```css
cheaper-together.cheaper-together__products {
  display: block;
  min-height: 320px; /* tune to final card stack */
}

cheaper-together:not([data-ready])::before {
  content: '';
  display: block;
  height: 280px;
  border-radius: 12px;
  background: linear-gradient(
    90deg,
    rgba(var(--color-foreground), 0.04),
    rgba(var(--color-foreground), 0.08),
    rgba(var(--color-foreground), 0.04)
  );
  background-size: 200% 100%;
  animation: shimmer var(--duration-extended) ease infinite;
}
```

Set `data-ready` after first paint in the custom element. Prefer Liquid rendering of the three product cards so crawlers and users without JS still see content.

### 6.3 Card-draw banner `filter: blur(33px)` (Medium)

`sections/card-draw-banner-slider.liquid` animates content with blur:

```css
@keyframes animate {
  from {
    opacity: 0;
    transform: translate(0, 100px);
    filter: blur(33px);
  }
  to {
    opacity: 1;
    transform: translate(0);
    filter: blur(0);
  }
}
```

Animating `filter: blur()` is expensive (often promotes large paint layers). Prefer opacity + transform only, and gate on reduced motion:

```css
@keyframes animate {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .card-draw__content .card-draw__name,
  .card-draw__content .card-draw__text,
  .card-draw__content button {
    animation: none !important;
    opacity: 1;
    transform: none;
  }
}
```

Longer-term: migrate this section onto `scroll-trigger animate--slide-in` for consistency.

### 6.4 Global Swiper on every page (Medium)

`layout/theme.liquid` loads `swiper-bundle.min.css` + `swiper-bundle.min.js` site-wide.

**Refactor:** Load assets only from sections that initialize Swiper (`special-offers`, etc.) via `{% once %}` stylesheet/script tags or `section` JSON `"stylesheet"` / deferred import when the section mounts. Reduces unused main-thread work and CSS on pages without carousels.

### 6.5 Cart / drawer `innerHTML` rewrites (Medium)

`cart.js` / `cart-drawer.js` rewrite large HTML chunks. Spinners already exist — keep them, and when replacing line items prefer morphing within a stable list container so footer totals don’t jump. Low-cost improvement: set `min-height` on `.drawer__inner` / `cart-drawer-items` during fetch similar to facets.

### 6.6 Already healthy

- Fonts use `font-display: swap` + preload in `theme.liquid`
- Stock `.media` padding-bottom / ratio boxes reserve space
- Zoom-in scroll uses `{ passive: true }` + `throttle()`
- Menu drawer overlay fade is a good reference implementation

---

## 7. Recommended implementation order

### Sprint 1 — High impact, low risk

1. Add `scroll-trigger` classes to homepage custom sections (`benefits`, banners, brands, newsletter, trending/special offers wrappers).
2. Fix invalid image dimensions; add `loading="lazy"` where appropriate; prefer `image_tag`.
3. Cart drawer: overlay fade + `--duration-medium` easing.
4. `cheaper-together` min-height/skeleton (or Liquid-render products).
5. Facets: height lock during grid swap; fix `initializeScrollAnimationTrigger` argument.

### Sprint 2 — Polish

6. Quick-add / modal open-close transitions.
7. Custom product card image hover + aspect-ratio wrapper.
8. Set theme hover to `vertical-lift` *or* add light button micro-interactions.
9. Accordion height animation with reduced-motion fallback.
10. Replace card-draw blur keyframes; add reduced-motion rules.
11. Section-scoped Swiper assets.

### Sprint 3 — Nice-to-have

12. Predictive search fade + reserved height while fetching.
13. Stock secondary-image opacity transition.
14. Normalize custom section CSS to `--duration-*` / `--ease-out-slow`.
15. Optional image `data-fade` load fade for non-LCP media.

---

## 8. Acceptance checklist

- [ ] With “Reveal sections on scroll” enabled, custom homepage blocks cascade in like stock Dawn sections.
- [ ] `prefers-reduced-motion: reduce` disables custom and extended motion (test in DevTools).
- [ ] Cart drawer open/close: overlay fades and panel eases ~300ms; no focus trap before `transitionend`.
- [ ] Quick-add modal does not pop in/out instantly.
- [ ] Lighthouse / Web Vitals: CLS improved on homepage banners, brand row, header promo, and PDP cheaper-together.
- [ ] Collection facet apply does not collapse the product grid to zero height.
- [ ] No new animation libraries added (GSAP, AOS, Animate.css, etc.).
- [ ] Theme Editor design mode still shows sections without stuck `opacity: 0.01` (Dawn’s `--design-mode` / `--cancel` classes).

---

## 9. File reference map

| Concern | Primary files |
|---------|----------------|
| Scroll reveals | `assets/animations.js`, `assets/base.css` (~3276–3327), `layout/theme.liquid` |
| Hover lifts | `assets/base.css` (~3330–3499), `config/settings_data.json` |
| Stock cards | `snippets/card-product.liquid`, `assets/component-card.css` |
| Custom cards | `snippets/custom-product-card.liquid`, `assets/custom-product-card.css` |
| Cart drawer | `assets/component-cart-drawer.css`, `assets/cart-drawer.js`, `snippets/cart-drawer.liquid` |
| Menu drawer | `assets/component-menu-drawer.css`, `assets/global.js` (`MenuDrawer`) |
| Modals | `assets/global.js` (`ModalDialog`), `assets/quick-add.css`, `assets/quick-add.js` |
| Accordions | `assets/component-accordion.css` |
| Facets / CLS | `assets/facets.js` |
| Async PDP CLS | `sections/cheaper-together.liquid` |
| Blur jank | `sections/card-draw-banner-slider.liquid` |
| Swiper weight | `layout/theme.liquid` (~300–304) |
| Invalid dims | `header-bottom`, `sale-banner`, `products-with-banner`, `all-brands`, `collection-showcase`, `newsletter-with-newfeed` |

---

*Generated from a static review of the repository’s CSS, JS, and Liquid. Validate motion timing and CLS on a staging theme with real product imagery before shipping.*
