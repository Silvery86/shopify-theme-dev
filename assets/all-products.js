class AllProducts extends HTMLElement {
  index = 0;

  constructor() {
    super();
    this.loadMoreButton = this.querySelector('button');
    this.productsPerRow = Number.parseInt(this.dataset.productsPerRow) || 4;
    this.remainingProducts = (this.dataset.remainingProducts || '')
      .split(',')
      .map((handle) => handle.trim())
      .filter(Boolean);
    this.grid = this.querySelector('.grid');

    if (!this.loadMoreButton) return;

    if (this.remainingProducts.length === 0) {
      this.loadMoreButton.remove();
      return;
    }

    this.loadMoreButton.addEventListener('click', this.loadMoreProducts.bind(this));
  }

  async loadMoreProducts() {
    this.loadMoreButton.setAttribute('disabled', 'true');
    const productsToLoad = this.remainingProducts.slice(this.index, this.index + this.productsPerRow);

    try {
      const cards = await Promise.all(
        productsToLoad.map(async (productHandle) => {
          const response = await fetch(`/products/${encodeURIComponent(productHandle)}?sections=card-product`);
          if (!response.ok) return '';
          const data = await response.json();
          return data['card-product'] || '';
        })
      );

      // Single parse/insert instead of re-serializing the whole grid per card.
      this.grid.insertAdjacentHTML('beforeend', cards.join(''));
      this.index += this.productsPerRow;
    } catch (error) {
      console.error('All Products: failed to load more products', error);
    } finally {
      if (this.index >= this.remainingProducts.length) {
        this.loadMoreButton.remove();
      } else {
        this.loadMoreButton.removeAttribute('disabled');
      }
    }
  }
}

customElements.define('all-products', AllProducts);
