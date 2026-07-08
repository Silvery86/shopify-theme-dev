# Backend / Liquid / API Review — Customized Dawn Theme

**Reviewer scope:** Liquid efficiency, section schema architecture, Cart/Predictive‑Search API usage, caching & global state.
**Focus:** The custom sections/snippets/JS added on top of stock Dawn (commits #12–#29). Stock Dawn code (`predictive-search.js`, `search-form.js`, `facets.js`, `cart.js`, `card-product.liquid`, etc.) is well‑built and is **not** the source of the issues below.

---

## 0. Severity summary

| # | Severity | Area | File(s) | Issue |
|---|----------|------|---------|-------|
| 1 | 🔴 Critical | Schema/Liquid | 8+ custom sections | Hyphenated setting IDs read with **dot notation** → Liquid parses `-` as subtraction → renders empty/`0`. Countdown, banner links, brand logos silently broken. |
| 2 | 🔴 High | Liquid perf | `all-products.liquid` | Iterates **entire** `collections.all.products` to build a giant CSV of handles into the HTML; invalid `sort` keys; N² `innerHTML +=` in JS. |
| 3 | 🔴 High | Liquid perf / API | `cheaper-together.liquid`, `upsell-bundles.liquid` | `collections.all.products \| where: 'vendor'` only sees first 50 products; then **serial** per‑product `fetch` (N round‑trips) and hidden DOM bloat. |
| 4 | 🟠 Medium | State | `cheaper-together`, `upsell-bundles`, `trending-products`, `custom-product-card` | Add‑to‑cart bypasses Dawn's cart pub/sub → full `location.reload()` / `/cart` redirect; header cart bubble goes stale. |
| 5 | 🟠 Medium | Liquid perf | `custom-product-card.liquid`, `product-rating*.liquid` | `stylesheet_tag` / inline `<style>` emitted **inside a loop** → duplicated N times per page. |
| 6 | 🟡 Low | Schema UX | `special-offers`, `all-products`, `all-brands` | Orphan/no‑op settings (`count-down-days`, fake sort options), hyphen‑case IDs, missing defaults. |
| 7 | 🟡 Low | DRY / bloat | rating snippets, inline SVG cart icon | Duplicated near‑identical code and a large inline SVG repeated per card. |

---

## 1. 🔴 Critical — Hyphenated setting IDs accessed with dot notation

**Files:** `trending-products.liquid:7`, `special-offers.liquid:12‑13,23`, `products-with-banner.liquid:9`, `all-brands.liquid:4,7,15,16,19`, `all-products.liquid:33‑34`, `benefits.liquid:6`, `header-bottom.liquid:152`, `sale-banner.liquid`.

In Liquid, `{{ section.settings.count-down-hours }}` is **not** a property lookup — the lexer reads it as the arithmetic expression `count − down − hours`. Because those variables don't exist, the output is empty (or `0`). The same applies inside `{% if %}`:

```liquid
{# special-offers.liquid:12 — renders data-hours="" → countdown shows 00:00:00 #}
data-hours="{{ section.settings.count-down-hours }}"

{# all-brands.liquid:4 — condition is falsy → brand logos NEVER render #}
{% if block.settings.brand-logo %}
  <img src="{{ block.settings.brand-logo | image_url }}" ...>
{% endif %}

{# trending-products.liquid:7 — href="" #}
<a href="{{ section.settings.trending-product-link }}">
```

**Impact:** The Special Offers countdown is stuck at `00h 00m 00s`; the All Brands logos and "view all" links, the trending "View all" link, and several banner button URLs are all blank in production. This is a functional bug, not just a style nit.

**Fix (recommended): rename IDs to `snake_case`** in the schema and in every reference. Snake_case is the Shopify convention and works with dot notation, template `t:` keys, and metafield tooling.

```liquid
{# schema #}
{ "type": "number", "id": "countdown_hours", "label": "Countdown hours", "default": 12 }

{# usage #}
data-hours="{{ section.settings.countdown_hours }}"
```

**Fix (minimal, if you can't rename): bracket notation everywhere.**

```liquid
data-hours="{{ section.settings['count-down-hours'] }}"
{% if block.settings['brand-logo'] %} ... {% endif %}
<a href="{{ section.settings['trending-product-link'] }}">
```

> Grep to find all offenders:
> ```bash
> grep -rn "settings\.[a-z0-9]*-[a-z0-9-]*" sections/ snippets/ | grep -v "\['"
> ```

---

## 2. 🔴 High — `all-products.liquid` (`sections/all-products.liquid`)

Three separate problems in one section.

### 2a. Building a full-store CSV of handles into the HTML (lines 3–27)

```liquid
{% assign sorted_products = collections.all.products %}
...
{% for product in sorted_products offset: section.settings.products_per_row %}
  {% assign remaining_products = remaining_products | append: product.handle %}
  {% unless forloop.last %}{% assign remaining_products = remaining_products | append: ',' %}{% endunless %}
{% endfor %}
...
<all-products data-remaining-products="{{ remaining_products }}">
```

- `collections.all.products` in an un‑paginated `for` loop is **capped at 50 items** by Liquid — so "All Products" silently never lists more than 50, regardless of catalog size.
- Repeated `assign ... | append` inside a loop reallocates the string on every iteration (O(n²) string building) and dumps the whole handle list into the DOM as a data attribute.

**Better:** don't ship handles at all — let the load‑more button fetch the next paginated page of the collection with the Section Rendering API, or drive it from `paginate`:

```liquid
{% paginate collections.all.products by section.settings.products_per_row %}
  <div class="grid">
    {% for product in collections.all.products %}
      {% render 'card-product', card_product: product %}
    {% endfor %}
  </div>
  {% if paginate.next %}
    <a class="button" href="{{ paginate.next.url }}" data-load-more>Load More</a>
  {% endif %}
{% endpaginate %}
```

and have the JS `fetch(nextUrl + '&section_id=' + sectionId)` to append. This removes the client‑side per‑handle fetching entirely.

### 2b. Invalid `sort` keys (lines 6–19)

```liquid
{%- when 'best_selling' -%}{%- assign sorted_products = sorted_products | sort: 'sales' %}
{%- when 'sale_percent' -%}{%- assign sorted_products = sorted_products | sort: 'on_sale' %}
{%- when 'sold_number' -%}{%- assign sorted_products = sorted_products | sort: 'sold_number' %}
```

`sort` only works on properties that exist on the product Drop. `sales`, `on_sale`, `sold_number` are not product properties, so these branches are **no‑ops** — the merchant picks "Best Selling" and nothing changes. Either remove these options from the schema (see §6) or drive sorting server‑side via the collection URL (`?sort_by=best-selling`) instead of in Liquid.

### 2c. N² DOM writes in `all-products.js` (lines 26–28)

```js
products.forEach((product) => { this.grid.innerHTML += product; });
```

`innerHTML +=` re‑serializes and re‑parses the **entire** grid on every card, destroying/rebuilding existing nodes (and any listeners) each time. Also: `console.log` left in, and no error handling if a fetch 404s (`data['card-product']` throws).

```js
async loadMoreProducts() {
  this.loadMoreButton.setAttribute('disabled', 'true');
  const toLoad = this.remainingProducts.slice(this.index, this.index + this.productsPerRow);
  try {
    const html = await Promise.all(
      toLoad.map(async (handle) => {
        const res = await fetch(`/products/${handle}?sections=card-product`);
        if (!res.ok) return '';
        const data = await res.json();
        return data['card-product'];
      })
    );
    this.grid.insertAdjacentHTML('beforeend', html.join(''));  // one parse, appends only
    this.index += this.productsPerRow;
  } catch (e) {
    console.error('Load more failed', e);
  } finally {
    if (this.index >= this.remainingProducts.length) this.loadMoreButton.remove();
    else this.loadMoreButton.removeAttribute('disabled');
  }
}
```

---

## 3. 🔴 High — "Cheaper Together" & "Upsell Bundles" data fetching

### 3a. `collections.all.products | where: 'vendor'` (cheaper-together.liquid:6, upsell-bundles.liquid:2)

```liquid
{% assign related_products = collections.all.products | where: 'vendor', product.vendor %}
```

`where` filters the array **after** Liquid has already truncated `collections.all.products` to the first 50 products. So "products by the same vendor" is really "same‑vendor products *that happen to be in the first 50 of the store*" — most matches are missed, and the result is unstable as the catalog changes.

**Better:** use Shopify's recommendations engine, which is purpose‑built for this and is cached server‑side:

```liquid
{# renders complementary/related products with no full-catalog scan #}
{% assign recs_url = routes.product_recommendations_url
   | append: '?section_id=' | append: section.id
   | append: '&product_id=' | append: product.id
   | append: '&intent=related&limit=3' %}
```

Then fetch that one URL client‑side (a single request, already deduped/cached by Shopify) instead of scanning `collections.all`.

### 3b. Serial `await` inside a `for…of` loop (cheaper-together.liquid:89–116)

```js
for (const handle of handles) {
  const product = await this.fetchProduct(handle);   // ⛔ each awaits the previous
  ...
}
```

Three products are fetched **one after another** — the 3rd request doesn't start until the 1st two finish. Parallelize:

```js
const results = await Promise.allSettled(handles.map((h) => this.fetchProduct(h)));
for (const r of results) {
  if (r.status !== 'fulfilled') continue;
  const product = r.value;
  // ...build card
}
```

### 3c. Upsell bundles ships hidden markup then shuffles in JS (upsell-bundles.liquid:8–37, 54–64)

All 10 candidate cards (with `<img src>`) are rendered into a `display:none` container, then JS keeps 3 at random and `hiddenContainer.remove()`. The browser still parses the full markup, and the randomness lives client‑side. Prefer selecting server‑side and rendering only what you show:

```liquid
{% assign related = product.recommendations.products | default: product.collections.first.products %}
{% for related_product in related limit: 3 %}
  ...only 3 cards, no hidden container...
{% endfor %}
```

*(If you truly need random rotation, `img loading="lazy"` on the hidden imgs at minimum avoids the wasted image downloads.)*

---

## 4. 🟠 Medium — Cart writes bypass Dawn's cart state (global state / caching)

**Files:** `cheaper-together.liquid:331‑356`, `upsell-bundles.liquid:70‑96`, `trending-products.liquid:46‑58`, `custom-product-card.liquid:39‑51`.

Every custom add‑to‑cart either does a native `<form action="/cart/add">` submit or `fetch('/cart/add.js')` followed by `window.location.href = '/cart'` / `location.reload()`. Problems:

- **Full page reload** on every add — the single slowest possible UX, and it discards Dawn's cart‑drawer/notification.
- The header **cart bubble (`cart-icon-bubble`) never updates** without a reload, because these flows don't publish Dawn's `PUB_SUB_EVENTS.cartUpdate` nor request the cart sections.

Dawn already exposes the right primitives. Add items *and* refresh the header/drawer in one round‑trip using the Section Rendering API + pub/sub:

```js
import { PUB_SUB_EVENTS, publish } from '{{ 'pubsub.js' | asset_url }}'; // or use window bus

const body = {
  items,
  sections: 'cart-icon-bubble,cart-notification-product,cart-drawer',
  sections_url: window.location.pathname,
};
const res = await fetch(`${routes.cart_add_url}.js`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify(body),
});
const parsed = await res.json();
// update the bubble/drawer from parsed.sections, then:
publish(PUB_SUB_EVENTS.cartUpdate, { source: 'cheaper-together', productVariantId: items[0].id, cartData: parsed });
```

This keeps cart count and drawer in sync with **no reload**. The raw `<form method="post" action="/cart/add">` in `trending-products.liquid` and `custom-product-card.liquid` should become a `product-form`/`<button>` wired to this fetch (they also always add `product.variants.first.id`, ignoring variant selection).

---

## 5. 🟠 Medium — Assets emitted inside loops (duplicate `<link>` / `<style>`)

### 5a. `stylesheet_tag` inside a looped snippet (custom-product-card.liquid:5)

`special-offers.liquid` renders `custom-product-card` up to `products-slider-total` (default 12) times, and each render emits:

```liquid
{{ 'custom-product-card.css' | asset_url | stylesheet_tag }}
```

→ 12 identical `<link>` tags in the DOM. Hoist the stylesheet to the **section** (once), and keep the snippet asset‑free:

```liquid
{# special-offers.liquid (top, outside the loop) #}
{{ 'custom-product-card.css' | asset_url | stylesheet_tag }}
{% for product in section.settings['special-offers-list'] limit: ... %}
  {% render 'custom-product-card', product: product %}
{% endfor %}
```

### 5b. Inline `<style>` inside `product-rating*.liquid` (lines 23–33)

The rating snippet is rendered once per card; each render prints a full `<style>.products-rating{…}</style>` block — so a 12‑product grid ships that CSS 12 times. Move both rating snippets' CSS into a real stylesheet loaded once by the parent section, and delete the inline `<style>`.

---

## 6. 🟡 Schema architecture notes

| File | Issue | Recommendation |
|------|-------|----------------|
| `special-offers.liquid:117‑119` | `count-down-days` setting exists but the JS never reads days (only h/m/s). | Remove the setting, or add days to the countdown math. |
| `all-products.liquid:106‑136` | Sort options `best_selling / sale_percent / sold_number` map to invalid Liquid sorts (no‑ops). | Remove them, or implement via `?sort_by=` on the collection URL. |
| All custom sections | Hyphen‑case IDs (`heading-title`, `products-slider-total`, `all-brands-logo`). | Standardize on `snake_case` (fixes §1 and matches Dawn). |
| `all-brands.liquid` | Grid is 6 columns but block `limit` is 5; "All Brands Image" is a separate one‑off setting bolted onto the block loop. | Raise block limit / clarify; consider a single repeatable "brand" block that optionally links. |
| `cheaper-together.liquid`, `product-options.liquid`, `product-breadcrumb.liquid` | `settings: []` but headings ("Cheaper together", tab labels) are hard‑coded. | Expose headings/labels as `text`/`inline_richtext` settings for merchant control. |
| Custom sections generally | No color‑scheme or padding settings; English strings hard‑coded instead of `t:` locale keys. | Where these appear on the storefront alongside Dawn sections, add `color_scheme` + `padding_top/bottom` for visual consistency. |
| `special-offers.liquid` `products-slider-total` | `type: number` with no min/max; a merchant can enter 999. | Use a `range` with sane bounds (you already do this for the per‑slide settings). |

---

## 7. 🟡 DRY / payload bloat

- **`product-rating.liquid` vs `product-rating-products.liquid`** are byte‑for‑byte identical except a class name and `font-size` (24px vs 12px). Collapse into one snippet parameterized by size/class: `{% render 'product-rating', product: product, size: 'sm' %}`. Also `product.metafields.custom.fake_rating` is checked by the caller *and* re‑checked inside the snippet — drop the outer `{% if %}` guards.
- **Inline cart‑icon SVG** (~1.5 KB) is duplicated verbatim in both `trending-products.liquid` and `custom-product-card.liquid`, and repeated once per card in the grid. Extract to `snippets/icon-cart.liquid` (or an SVG asset via `inline_asset_content`) and `{% render %}` it — smaller HTML, one source of truth.
- The half‑star math (`rating | minus: full_stars | times: 10 | round`, then `>= 5`) is hard to follow; a comment or a simpler `modulo`‑style computation would help maintenance.

---

## 8. What's already good ✅

- Predictive search (`predictive-search.js`) correctly uses `AbortController` to cancel in‑flight requests, and `search-form.js` debounces input — **no changes needed there.**
- `all-products.js` and `cheaper-together` addToCart have `try/catch` / `.catch` error handling (the gap is *parallelism* and *cart‑state sync*, addressed above).
- `related-products.liquid` correctly uses Dawn's `product-recommendations` custom element + Section Rendering API + `skip_styles` flag — this is the pattern the custom "cheaper together"/"upsell" sections should copy.
- `image_tag`/explicit `width`/`height` are used in most image renders, which is good for CLS.

---

## 9. Prioritized action checklist

1. **[Critical]** Fix all hyphen‑case setting references (§1) — restores broken countdown, brand logos, and banner links. Do this first; it's a correctness bug, not perf.
2. **[High]** Rework `all-products.liquid` to `paginate` + Section Rendering API; fix `innerHTML +=` → `insertAdjacentHTML` (§2).
3. **[High]** Replace `collections.all | where:'vendor'` with `product.recommendations`; parallelize the JS fetches (§3).
4. **[Medium]** Route all custom add‑to‑cart through the Cart API + `sections:` + `PUB_SUB_EVENTS.cartUpdate`; remove `location.reload()`/`/cart` redirects (§4).
5. **[Medium]** Hoist `stylesheet_tag`/`<style>` out of looped snippets (§5).
6. **[Low]** Schema cleanup, DRY the rating snippets, extract the cart‑icon SVG (§6–§7).
