// lib/text-variant-extractor.ts
// Extrait la signature de variante depuis le NOM TEXTUEL de l'item — pas de NBT necessaire
// Simple, rapide, fiable — base sur les symboles visuels que Hypixel affiche directement

export interface VariantSignature {
  stars: number;
  masterStars: number;
  totalStars: number;
  hasDye: boolean;
  recombobulated: boolean;
  reforge: string | null;
  variantKey: string;
  baseName: string;
}

// Liste complete des reforges connus — fusion de nos tables `reforges` + `reforge_stones` (NEU constants)
// Triee par longueur decroissante pour eviter les faux matchs partiels (ex: "Ancient" avant un mot plus court qui s'y trouverait inclus)
const KNOWN_REFORGES = [
  'Astute', 'Awkward', 'Blended', 'Brilliant', 'Clean', 'Colossal', 'Deadly', 'Double-Bit',
  'Epic', 'Excellent', 'Fair', 'Fast', 'Fierce', 'Fine', 'Fortunate', 'Gentle', 'Grand', 'Great',
  'Green Thumb', 'Hasty', 'Heavy', 'Hefty', 'Heroic', 'Honored', 'Legendary', 'Light',
  "Lumberjack's", 'Lush', 'Menacing', 'Mythic', 'Neat', 'Odd', "Peasant's", "Prospector's",
  'Pure', 'Rapid', 'Rich', 'Robust', 'Rugged', 'Sharp', 'Smart', 'Soft', 'Spicy', 'Stained',
  'Sturdy', 'Titanic', 'Unreal', 'Unyielding', 'Wise', 'Zooming',
  'Ambered', 'Ancient', 'Auspicious', 'Beady', 'Blazing', 'Blessed', 'Blood-Soaked', 'Bloodshot',
  'Blooming', 'Bountiful', 'Bulky', 'Bustling', 'Buzzing', 'Calcified', 'Candied', 'Chomp',
  'Coldfused', 'Cubic', 'Deep Fried', 'Dimensional', 'Dirty', 'Earthy', 'Empowered', 'Erudite',
  'Fabled', 'Fanged', 'Festive', 'Fleet', 'Fortified', 'Fruitful', 'Giant', 'Gilded', 'Glacial',
  'Glistening', 'Greater Spook', 'Groovy', 'Headstrong', 'Heated', 'Hyper', 'Jaded', "Jerry's",
  'Loving', 'Lucky', 'Lunar', 'Lustrous', 'Magnetic', 'Mantid', 'Mithraic', 'Moil', 'Moonglade',
  'Mossy', 'Necrotic', 'Overpriced', 'Perfect', "Pitchin'", 'Precise', 'Refined', 'Reinforced',
  'Renowned', 'Ridiculous', 'Rooted', 'Royal', 'Salty', 'Scraped', 'Snowy', 'Spiked', 'Spiritual',
  'Squeaky', 'Stellar', 'Stiff', 'Strengthened', 'Submerged', 'Sunny', 'Suspicious', 'Toil',
  'Trashy', 'Treacherous', 'Undead', 'Warped', 'Waxed', 'Withered'
].sort((a, b) => b.length - a.length);

export function extractVariantFromName(itemName: string): VariantSignature {
  const baseStars = (itemName.match(/✪/g) || []).length;

  const masterStarMap: Record<string, number> = {
    '➊': 1, '➋': 2, '➌': 3, '➍': 4, '➎': 5, '➏': 6, '➐': 7, '➑': 8, '➒': 9, '➓': 10
  };
  let masterStars = 0;
  for (const [symbol, value] of Object.entries(masterStarMap)) {
    if (itemName.includes(symbol)) {
      masterStars = value;
      break;
    }
  }

  const hasDye = itemName.includes('✿');
  const recombobulated = itemName.includes('✦');
  const totalStars = baseStars + masterStars;

  // Nettoie les symboles avant de chercher le reforge (mot en debut de nom)
  let cleanedName = itemName
    .replace(/✿/g, '')
    .replace(/✦/g, '')
    .replace(/✪/g, '')
    .replace(/[➊➋➌➍➎➏➐➑➒➓]/g, '')
    .trim();

  let reforge: string | null = null;
  for (const rf of KNOWN_REFORGES) {
    if (cleanedName.startsWith(rf + ' ')) {
      reforge = rf;
      cleanedName = cleanedName.slice(rf.length).trim();
      break;
    }
  }

  const baseName = cleanedName;

  const starBucket = totalStars >= 10 ? '10star' : totalStars >= 5 ? '5star' : totalStars > 0 ? `${totalStars}star` : 'nostar';
  const recombPart = recombobulated ? 'recomb' : 'norecomb';
  const reforgePart = reforge ? reforge.toLowerCase() : 'noreforge';
  const variantKey = `${starBucket}_${recombPart}_${reforgePart}`;

  return { stars: baseStars, masterStars, totalStars, hasDye, recombobulated, reforge, variantKey, baseName };
}

// NOTE HONNETE : les enchantements ne sont JAMAIS visibles dans le nom affiche d'un item Hypixel —
// ils n'apparaissent que dans le lore/tooltip (donnee NBT). Impossible de les extraire via le texte seul.
// Une vraie extraction des enchants necessiterait de decoder le NBT (item_bytes), ce qu'on a deliberement
// evite pour des raisons de performance/fiabilite sur un scan de milliers d'encheres.