// Curated list of iNat taxon ids for North American cavity-nesting birds.
// This is the authoritative source for the "Cavity nester" filter in the
// species picker — iNat does not carry this trait as structured data.
// Add new ids by appending to the array; the Set is built once at module load.
//
// Ownership: conservation staff. When adding, include the common name in the
// trailing comment for reviewability.

const IDS: readonly number[] = [
  // Woodpeckers (Picidae)
  18472,  // Northern Flicker (Colaptes auratus)
  18422,  // Downy Woodpecker (Dryobates pubescens)
  18436,  // Hairy Woodpecker (Dryobates villosus)
  18434,  // Red-bellied Woodpecker (Melanerpes carolinus)
  18416,  // Pileated Woodpecker (Dryocopus pileatus)
  18408,  // Red-headed Woodpecker (Melanerpes erythrocephalus)
  18410,  // Lewis's Woodpecker (Melanerpes lewis)
  // Chickadees and titmice (Paridae)
  14836,  // Black-capped Chickadee (Poecile atricapillus)
  14850,  // Carolina Chickadee (Poecile carolinensis)
  14854,  // Mountain Chickadee (Poecile gambeli)
  14864,  // Tufted Titmouse (Baeolophus bicolor)
  // Bluebirds and thrushes (Turdidae)
  12727,  // Eastern Bluebird (Sialia sialis)
  12728,  // Western Bluebird (Sialia mexicana)
  12729,  // Mountain Bluebird (Sialia currucoides)
  // Swallows (Hirundinidae)
  10237,  // Tree Swallow (Tachycineta bicolor)
  10236,  // Violet-green Swallow (Tachycineta thalassina)
  10251,  // Purple Martin (Progne subis)
  // Wrens (Troglodytidae)
  14118,  // House Wren (Troglodytes aedon)
  14138,  // Carolina Wren (Thryothorus ludovicianus)
  14123,  // Bewick's Wren (Thryomanes bewickii)
  // Nuthatches (Sittidae)
  14887,  // White-breasted Nuthatch (Sitta carolinensis)
  14889,  // Red-breasted Nuthatch (Sitta canadensis)
  // Owls (Strigidae)
  19346,  // Eastern Screech-Owl (Megascops asio)
  19345,  // Western Screech-Owl (Megascops kennicottii)
  19354,  // Northern Saw-whet Owl (Aegolius acadicus)
  // Ducks (Anatidae — cavity-nesting species only)
  6912,   // Wood Duck (Aix sponsa)
  6920,   // Bufflehead (Bucephala albeola)
  6928,   // Common Goldeneye (Bucephala clangula)
  6924,   // Hooded Merganser (Lophodytes cucullatus)
  // Kestrels (Falconidae)
  5287,   // American Kestrel (Falco sparverius)
  // Swifts (Apodidae)
  16846,  // Chimney Swift (Chaetura pelagica)
  // Flycatchers (Tyrannidae)
  17105,  // Great Crested Flycatcher (Myiarchus crinitus)
  17106,  // Ash-throated Flycatcher (Myiarchus cinerascens)
  // Starlings (Sturnidae — non-native but cavity-nesting)
  13858,  // European Starling (Sturnus vulgaris)
  // Sparrows (Passeridae)
  13851,  // House Sparrow (Passer domesticus)
];

export const CAVITY_NESTER_TAXON_IDS: ReadonlySet<number> = new Set(IDS);

export function isCavityNester(taxonId: number): boolean {
  return CAVITY_NESTER_TAXON_IDS.has(taxonId);
}
