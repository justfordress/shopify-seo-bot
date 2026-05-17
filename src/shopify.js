// Client Shopify Admin API

const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN; // ex: ma-boutique.myshopify.com
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = "2024-10";

function shopifyFetch(path, method = "GET", body = null) {
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}${path}`;
  const options = {
    method,
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_TOKEN,
      "Content-Type": "application/json",
    },
  };
  if (body) options.body = JSON.stringify(body);
  return fetch(url, options).then(async (res) => {
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify API ${res.status}: ${text}`);
    }
    return res.json();
  });
}

// Récupère les metafields d'un produit et les retourne sous forme d'objet clé/valeur
// On mappe les clés Shopify vers des noms lisibles pour le prompt IA
export async function getProductMetafields(productId) {
  try {
    const data = await shopifyFetch(`/products/${productId}/metafields.json`);
    const fields = data.metafields || [];

    const result = {};
    for (const field of fields) {
      // Mappe les clés connues de ta boutique
      const key = field.key?.toLowerCase();
      if (key?.includes("composition") || key?.includes("entretien") || key?.includes("matiere")) {
        result.composition = field.value;
      } else if (key?.includes("taille") || key?.includes("conseil") || key?.includes("size")) {
        result.conseil_taille = field.value;
      } else {
        // Récupère quand même les autres champs méta au cas où
        result[field.key] = field.value;
      }
    }

    console.log(`  📋 Metafields récupérés :`, Object.keys(result).join(", ") || "aucun");
    return result;
  } catch (err) {
    console.warn(`  ⚠️  Impossible de récupérer les metafields : ${err.message}`);
    return {};
  }
}

// Met à jour le texte alt d'une image produit
export async function updateImageAlt(productId, imageId, altText) {
  return shopifyFetch(`/products/${productId}/images/${imageId}.json`, "PUT", {
    image: { id: imageId, alt: altText },
  });
}

// Met à jour description + meta SEO + titre enrichi du produit
export async function updateProductSEO(productId, { seo_title, description_html, meta_title, meta_description }) {
  const productPayload = {
    id: productId,
    body_html: description_html,
    metafields_global_title_tag: meta_title,
    metafields_global_description_tag: meta_description,
  };

  // Enrichit le titre produit avec les mots-clés longue traîne si généré
  // ex: "Robe Marie" → "Robe Marie - Robe courte avec broderie anglaise"
  if (seo_title) {
    productPayload.title = seo_title;
  }

  return shopifyFetch(`/products/${productId}.json`, "PUT", {
    product: productPayload,
  });
}

// Ajoute des tags au produit (en conservant les existants)
export async function addProductTags(productId, existingTags, newKeywords) {
  const existing = existingTags ? existingTags.split(",").map((t) => t.trim()) : [];
  const merged = [...new Set([...existing, ...newKeywords])].join(", ");
  return shopifyFetch(`/products/${productId}.json`, "PUT", {
    product: { id: productId, tags: merged },
  });
}
