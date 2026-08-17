// The Seed Vault: bred genomes planted for keeps. localStorage-backed,
// newest first, capped — the museum slowly fills with visitor-bred plants.
import { genomeToVariation } from "./genetics.js";

const KEY = "museum.vault.v1";
const CAP = 12;

export function vaultList() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

export function vaultPlant(genome, name) {
  const list = vaultList();
  list.unshift({ genome, name, date: new Date().toISOString().slice(0, 10) });
  while (list.length > CAP) list.pop();
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* private mode: the planting won't survive reload */
  }
  return list.length;
}

export function syncVaultVariations(family) {
  family.variations = vaultList().map((e) =>
    genomeToVariation(e.genome, e.name, "planted " + e.date),
  );
}
