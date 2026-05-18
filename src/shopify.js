const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = "2026-04";

// REST API call
async function restFetch(path, method = "GET", body = null) {
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}${path}`;
  const options = {
    method,
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_TOKEN,
      "Content-Type": "application/json",
    },
  };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify API ${res.status}: ${text}`);
  }
  return res.json();
}

// Met à jour le texte alt d'une image produit
export async function updateImageAlt(productId, imageId, altText) {
  return restFetch(`/products/${productId}/images/${imageId}.json`, "PUT", {
    image: { id: imageId, alt: altText },
  });
}

// Met à jour description + meta SEO + titre
export async function updateProductSEO(productId, { seo_title, description_html, meta_title, meta_description }) {
  const productPayload = {
    id: productId,
    body_html: description_html,
    metafields_global_title_tag: meta_title,
    metafields_global_description_tag: meta_description,
  };
  if (seo_title) productPayload.title = seo_title;
  return restFetch(`/products/${productId}.json`, "PUT", { product: productPayload });
}

// Ajoute des tags au produit
export async function addProductTags(productId, existingTags, newKeywords) {
  const existing = existingTags ? existingTags.split(",").map((t) => t.trim()) : [];
  const merged = [...new Set([...existing, ...newKeywords])].join(", ");
  return restFetch(`/products/${productId}.json`, "PUT", {
    product: { id: productId, tags: merged },
  });
}
