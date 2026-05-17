import { generateAltTexts, generateSEOContent } from "./ai.js";
import { updateImageAlt, updateProductSEO, addProductTags, getProductMetafields } from "./shopify.js";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Nouveau produit créé ─────────────────────────────────────────────────────
// On ne fait RIEN ici — le produit est incomplet (photo fournisseur, pas de composition)
// Tout se passe sur products/update quand la composition est renseignée
export async function handleProductCreated(product) {
  console.log(`\n🆕 Nouveau produit créé : "${product.title}" — en attente de la composition pour générer le SEO.`);
}

// ─── Produit mis à jour ───────────────────────────────────────────────────────
export async function handleProductUpdated(product) {
  console.log(`\n♻️  Mise à jour : "${product.title}" (id: ${product.id})`);

  // 1. Récupère les metafields
  const metafields = await getProductMetafields(product.id);

  // 2. Vérifie que la composition est renseignée — c'est le déclencheur
  if (!metafields.composition || metafields.composition.trim() === "") {
    console.log(`⏭️  Composition absente — SEO non généré. Renseigne "Composition et entretien" pour déclencher la génération.`);
    return;
  }

  // 3. Vérifie que la description est encore vide (pas déjà générée)
  if (product.body_html && product.body_html.trim() !== "") {
    console.log(`⏭️  Description déjà présente — rien à faire.`);

    // Par contre si de nouvelles photos ont été ajoutées récemment, on regénère les alt texts
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

  // 4. Vérifie qu'il y a au moins une image (les vraies photos, pas juste une photo fournisseur)
  if (!product.images || product.images.length === 0) {
    console.log(`⏭️  Aucune image — SEO non généré. Ajoute les photos produit pour déclencher la génération.`);
    return;
  }

  // ✅ Tout est là : composition renseignée + description vide + photos présentes
  console.log(`✅ Déclenchement SEO : composition renseignée, description vide, ${product.images.length} photo(s) disponible(s).`);
  await processProduct(product, metafields);
}

// ─── Génération des textes alt uniquement ────────────────────────────────────
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

// ─── Traitement complet : alt texts + description + meta + tags ───────────────
async function processProduct(product, metafields) {
  const errors = [];

  // 1. Textes alt
  await generateAndUpdateAltTexts(product);

  // 2. Description + meta SEO + titre enrichi
  try {
    const seoContent = await generateSEOContent(product, metafields);
    await delay(300);
    await updateProductSEO(product.id, seoContent);
    console.log("  📝 Description + meta SEO + titre mis à jour");

    // 3. Tags longue traîne
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
