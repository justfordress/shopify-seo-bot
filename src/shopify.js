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

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GraphQL HTTP ${res.status}: ${text}`);
  }

  const data = await res.json();
  if (data.errors) {
    throw new Error(`GraphQL Error: ${JSON.stringify(data.errors)}`);
  }
  return data.data;
}

// Met à jour le texte alt d'une image produit via GraphQL
export async function updateImageAlt(productId, imageId, altText) {
  const query = `
    mutation productImageUpdate($productId: ID!, $image: ImageInput!) {
      productImageUpdate(productId: $productId, image: $image) {
        image { id altText }
        userErrors { field message }
      }
    }
  `;
  const variables = {
    productId: `gid://shopify/Product/${productId}`,
    image: {
      id: `gid://shopify/ProductImage/${imageId}`,
      altText,
    },
  };
  const data = await graphql(query, variables);
  const errors = data?.productImageUpdate?.userErrors;
  if (errors?.length > 0) {
    throw new Error(`Image alt error: ${JSON.stringify(errors)}`);
  }
  return data;
}

// Met à jour description + meta SEO + titre via GraphQL
export async function updateProductSEO(productId, { seo_title, description_html, meta_title, meta_description }) {
  const query = `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id title }
        userErrors { field message }
      }
    }
  `;
  const input = {
    id: `gid://shopify/Product/${productId}`,
    descriptionHtml: description_html,
    seo: {
      title: meta_title,
      description: meta_description,
    },
  };

  if (seo_title) {
    input.title = seo_title;
  }

  const data = await graphql(query, { input });
  const errors = data?.productUpdate?.userErrors;
  if (errors?.length > 0) {
    throw new Error(`Product update error: ${JSON.stringify(errors)}`);
  }
  return data;
}

// Ajoute des tags au produit via GraphQL
export async function addProductTags(productId, existingTags, newKeywords) {
  const existing = existingTags ? existingTags.split(",").map((t) => t.trim()) : [];
  const merged = [...new Set([...existing, ...newKeywords])];

  const query = `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id tags }
        userErrors { field message }
      }
    }
  `;
  const data = await graphql(query, {
    input: {
      id: `gid://shopify/Product/${productId}`,
      tags: merged,
    },
  });
  const errors = data?.productUpdate?.userErrors;
  if (errors?.length > 0) {
    throw new Error(`Tags update error: ${JSON.stringify(errors)}`);
  }
  return data;
}
