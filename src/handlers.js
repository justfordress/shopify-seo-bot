import { generateAltTexts, generateSEOContent } from "./ai.js";
import { updateImageAlt, updateProductSEO, addProductTags } from "./shopify.js";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export async function handleProductCreated(product) {
  console.log(`\n🆕 Nouveau produit créé : "${product.title}" — en attente de la publication en ligne.`);
}

export async function handleProductUpdated(product) {
  console.log(`\n♻️  Mise à jour : "${product.title}" (id: ${product.id})`);

  // 1. Vérifie si le produit est publié sur "Boutique en ligne"
  // published_at est renseigné uniquement quand le produit est actif sur au moins un canal
  const isPublished = product.published_at !== null && product.published_at !== undefined;

  if (!isPublished) {
    console.log(`⏭️  Produit non publié en ligne — SEO non généré.`);
    return;
  }

  // 2. Vérifie que la description est encore vide (pas déjà générée)
  if (product.body_html && product.body_html.trim() !== "") {
    console.log(`⏭️  Description déjà présente — vérification des nouvelles photos...`);

    const hasNewImages = product.images?.some((img) => {
      const updatedAt = new Date(img.updated_at);
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      return updatedAt > fiveMinutesAgo;
    });

    if (hasNewImages) {
      console.log(`  🖼️  Nouvelles photos détectées — mise à jour des textes alt uniquement.`);
      await generateAndUpdateAltTexts(product);
    }
    return;
  }

  // 3. Vérifie qu'il y a au moins une image
  if (!product.images || product.images.length === 0) {
    console.log(`⏭️  Aucune image — SEO non généré.`);
    return;
  }

  // ✅ Publié + description vide + photos = on génère tout
  console.log(`✅ Déclenchement SEO : produit publié, description vide, ${product.images.length} photo(s).`);
  await processProduct(product);
}

async function generateAndUpdateAltTexts(product) {
  try {
    const altResults = await generateAltTexts(product);
    for (const { imageId, altText } of altResults) {
      if (!altText) continue;
      await delay(300);
      await updateImageAlt(product.id, imageId, altText);
    }
    console.log(`  📷 ${altResults.filter((r) => r.altText).length} texte(s) alt mis à jour`);
  } catch (err) {
    console.error("  ❌ Erreur textes alt :", err.message);
  }
}

async function processProduct(product) {
  const errors = [];

  await generateAndUpdateAltTexts(product);

  try {
    const seoContent = await generateSEOContent(product, {});
    await delay(300);
    await updateProductSEO(product.id, seoContent);
    console.log("  📝 Description + meta SEO + titre mis à jour");

    if (seoContent.keywords?.length > 0) {
      await delay(300);
      await addProductTags(product.id, product.tags, seoContent.keywords);
      console.log(`  🏷️  Tags ajoutés : ${seoContent.keywords.join(", ")}`);
    }
  } catch (err) {
    errors.push(`SEO content : ${err.message}`);
    console.error("  ❌ Erreur SEO content :", err.message);
  }

  if (errors.length === 0) {
    console.log(`✨ Produit "${product.title}" entièrement optimisé !\n`);
  } else {
    console.warn(`⚠️  Produit "${product.title}" traité avec ${errors.length} erreur(s) :`, errors);
  }
}
