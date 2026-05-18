const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = "2026-04";

async function graphql(query, variables = {}) {
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const data = await res.json();

  if (data.errors) {
    throw new Error(`GraphQL Error: ${JSON.stringify(data.errors)}`);
  }
  return data.data;
}

// Met à jour le texte alt d'une image produit
export async function updateImageAlt(productId, imageId, altText) {
  const data = await graphql(`
    mutation productUpdateMedia($productId: ID!, $media: [UpdateMediaInput!]!) {
      productUpdateMedia(productId: $productId, media: $media) {
        media {
          ... on MediaImage {
            id
            image { altText }
          }
        }
        mediaUserErrors { field message code }
      }
    }
  `, {
    productId: `gid://shopify/Product/${productId}`,
    media: [{
      id: `gid://shopify/MediaImage/${imageId}`,
      alt: altText,
    }],
  });

  const errors = data?.productUpdateMedia?.mediaUserErrors;
  if (errors?.length > 0) throw new Error(`Alt error: ${JSON.stringify(errors)}`);
  return data;
}

// Met à jour description + meta SEO + titre
export async function updateProductSEO(productId, { seo_title, description_html, meta_title, meta_description }) {
  const input = {
    id: `gid://shopify/Product/${productId}`,
    descriptionHtml: description_html,
    seo: {
      title: meta_title,
      description: meta_description,
    },
  };
  if (seo_title) input.title = seo_title;

  const data = await graphql(`
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id title descriptionHtml }
        userErrors { field message }
      }
    }
  `, { input });

  const errors = data?.productUpdate?.userErrors;
  if (errors?.length > 0) throw new Error(`Update error: ${JSON.stringify(errors)}`);
  return data;
}

// Ajoute des tags au produit
export async function addProductTags(productId, existingTags, newKeywords) {
  const existing = existingTags ? existingTags.split(",").map((t) => t.trim()) : [];
  const merged = [...new Set([...existing, ...newKeywords])];

  const data = await graphql(`
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id tags }
        userErrors { field message }
      }
    }
  `, {
    input: {
      id: `gid://shopify/Product/${productId}`,
      tags: merged,
    },
  });

  const errors = data?.productUpdate?.userErrors;
  if (errors?.length > 0) throw new Error(`Tags error: ${JSON.stringify(errors)}`);
  return data;
}
