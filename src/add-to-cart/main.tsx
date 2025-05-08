import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AddToCart from './addToCart.tsx'

const addToCartRoot = document.getElementById('add-to-cart-button');

if (addToCartRoot) {
  const variantId = addToCartRoot.dataset.variantId
  const productTitle = addToCartRoot.dataset.productTitle

  if (variantId && productTitle) {
    createRoot(addToCartRoot!).render(
      <StrictMode>
        <AddToCart
          variantId={Number.parseInt(variantId)}
        productTitle={productTitle} />
      </StrictMode>,
    )
  }


}

