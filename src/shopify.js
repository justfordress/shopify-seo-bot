/**
 * Appels à l'API Shopify Admin REST.
 */

const API_VERSION = "2026-04";

async function shopifyFetch(path, method = "GET", body = null) {
  const url = `https://${process.env.SHOPIFY_SHOP}/admin/api/${API_VERSION}${path}`;

  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
    },
  };

  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url, options);

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Shopify API ${res.status} sur ${path}: ${err}`);
  }

  return res.json();
}

// ── Met à jour le texte alt d'une image produit ───────────────────────────────
export async function setImageAltText(productId, imageId, altText) {
  return shopifyFetch(`/products/${productId}/images/${imageId}.json`, "PUT", {
    image: {
      id: imageId,
      alt: altText,
    },
  });
}

// ── Met à jour description + meta SEO + titre enrichi ────────────────────────
export async function updateProductSEO(
  productId,
  { seo_title, description_html, meta_title, meta_description }
) {
  const payload = {
    id: productId,
    body_html: description_html,
    metafields_global_title_tag: meta_title,
    metafields_global_description_tag: meta_description,
  };

  // Enrichit le titre produit si l'IA en a généré un
  // Ex: "Robe Marie" → "Robe Marie - Robe fleurie en viscose légère"
  if (seo_title) {
    payload.title = seo_title;
  }

  return shopifyFetch(`/products/${productId}.json`, "PUT", {
    product: payload,
  });
}
