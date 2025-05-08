
function addToCart({ variantId, productTitle }: { variantId: number, productTitle: string }) {

  async function addToCart() {
    const cartDrawer: any = document.querySelector("cart-drawer");
    // Add product to cart request    
    const addToCartRequest = await fetch('/cart/add.js', {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [
          {
            quantity: 1,
            id: variantId,
          }
        ],
        sections: cartDrawer.getSectionsToRender().map((section: any) => section.id)
      })
    })

    const response = await addToCartRequest.json();
    console.log(response);
    cartDrawer.renderContents(response);
  }
  return (
    <>
      <button onClick={addToCart}>Add {productTitle} to Cart</button>
    </>
  )
}

export default addToCart
