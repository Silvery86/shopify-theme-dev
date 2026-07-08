/*
 * Shared add-to-cart helper for the custom sections (trending products, custom
 * product card / special offers, cheaper together, upsell bundles).
 *
 * Adds line item(s) through the Cart Ajax API and reuses Dawn's existing
 * `cart-notification` / `cart-drawer` element to refresh the header cart bubble
 * and reveal the cart — so there is no full-page reload and the cart count stays
 * in sync everywhere.
 *
 * Loaded once globally from theme.liquid; the delegated `submit` listener below
 * must only be registered a single time (hence: do not load this per-section).
 */
async function customAddToCart(items) {
  const cart = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
  const addUrl = (window.routes && window.routes.cart_add_url) || '/cart/add';

  const body = { items };
  if (cart) {
    body.sections = cart.getSectionsToRender().map((section) => section.id);
    body.sections_url = window.location.pathname;
    if (typeof cart.setActiveElement === 'function' && document.activeElement) {
      cart.setActiveElement(document.activeElement);
    }
  }

  const response = await fetch(`${addUrl}.js`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.description || data.message || 'Add to cart failed');
  }

  if (cart && typeof cart.renderContents === 'function') {
    // Reuses Dawn's rendering: updates cart-icon-bubble + notification/drawer.
    cart.renderContents(data);
  } else {
    // No drawer/notification on this page — fall back to the cart page.
    window.location = (window.routes && window.routes.cart_url) || '/cart';
  }

  return data;
}

// Progressive enhancement: intercept the quick-add forms in the custom product
// cards so they use the Ajax cart instead of a full-page POST to /cart/add.
// If JS fails, the native form submit still works.
document.addEventListener('submit', (event) => {
  const form = event.target.closest('form[data-custom-add-to-cart]');
  if (!form) return;
  event.preventDefault();

  const idInput = form.querySelector('[name="id"]');
  if (!idInput || !idInput.value) return;

  const button = form.querySelector('button[type="submit"]');
  if (button) button.setAttribute('disabled', 'true');

  customAddToCart([{ id: Number(idInput.value), quantity: 1 }])
    .catch((error) => console.error('Quick add failed:', error))
    .finally(() => {
      if (button) button.removeAttribute('disabled');
    });
});

window.customAddToCart = customAddToCart;
