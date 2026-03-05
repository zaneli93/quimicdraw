import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.resolve(__dirname, '..', 'data', 'hydrocarbons.json');

function countCarbons(smiles) {
  return (smiles.match(/[Cc]/g) ?? []).length;
}

function validateTypeRules(entry) {
  const failures = [];
  const { name, smiles, type } = entry;

  if (type === 'alceno' && !smiles.includes('=')) {
    failures.push(`${name}: alceno deve conter ao menos uma ligacao dupla (=).`);
  }

  if (type === 'alcino' && !smiles.includes('#')) {
    failures.push(`${name}: alcino deve conter ao menos uma ligacao tripla (#).`);
  }

  if (type === 'dieno') {
    const doubleBonds = (smiles.match(/=/g) ?? []).length;
    if (doubleBonds < 2) {
      failures.push(`${name}: dieno deve conter ao menos duas ligacoes duplas (=).`);
    }
  }

  if (type === 'cicloalcano' && !/[1-9]/.test(smiles)) {
    failures.push(`${name}: cicloalcano deve conter fechamento de anel (digito).`);
  }

  if (type === 'aromatico' && !/[c]/.test(smiles)) {
    failures.push(`${name}: aromatico deve conter carbono aromatico em minusculo (c).`);
  }

  return failures;
}

async function loadParser() {
  try {
    const mod = await import('smiles-drawer');
    const SmilesDrawer = mod.default ?? mod.SmiDrawer ?? mod.Drawer ?? mod;
    const parseFn = SmilesDrawer?.parse ?? mod.parse;

    if (typeof parseFn !== 'function') {
      return null;
    }

    return parseFn.bind(SmilesDrawer);
  } catch {
    return null;
  }
}

async function validateSmilesParse(entries, parseFn) {
  const failures = [];

  if (!parseFn) {
    console.warn('Aviso: smiles-drawer.parse indisponivel, validacao de parse foi pulada.');
    return failures;
  }

  for (const entry of entries) {
    const { name, smiles } = entry;

    try {
      await new Promise((resolve, reject) => {
        parseFn(
          smiles,
          () => resolve(undefined),
          (error) => reject(error),
        );
      });
    } catch (error) {
      failures.push(`${name}: SMILES invalido para parser (${String(error)}).`);
    }
  }

  return failures;
}

async function main() {
  const raw = await fs.readFile(dataPath, 'utf8');
  const entries = JSON.parse(raw);

  if (!Array.isArray(entries)) {
    throw new Error('hydrocarbons.json deve conter um array.');
  }

  const failures = [];
  const seenNames = new Set();

  for (const entry of entries) {
    const { name, smiles, carbons, type } = entry;

    if (!name || typeof name !== 'string') {
      failures.push('Entrada sem nome valido.');
      continue;
    }

    if (seenNames.has(name)) {
      failures.push(`${name}: nome duplicado.`);
    }
    seenNames.add(name);

    if (typeof smiles !== 'string' || smiles.trim().length === 0) {
      failures.push(`${name}: SMILES ausente ou invalido.`);
      continue;
    }

    if (!Number.isInteger(carbons) || carbons <= 0) {
      failures.push(`${name}: campo carbons deve ser inteiro positivo.`);
    }

    const countedCarbons = countCarbons(smiles);
    if (countedCarbons !== carbons) {
      failures.push(`${name}: carbons=${carbons}, mas SMILES possui ${countedCarbons} carbonos.`);
    }

    if (typeof type !== 'string' || type.trim().length === 0) {
      failures.push(`${name}: type ausente ou invalido.`);
    } else {
      failures.push(...validateTypeRules(entry));
    }
  }

  const parseFn = await loadParser();
  failures.push(...(await validateSmilesParse(entries, parseFn)));

  if (failures.length > 0) {
    console.error('Falhas na validacao de hidrocarbonetos:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(`Validacao concluida: ${entries.length} moleculas consistentes.`);
}

main().catch((error) => {
  console.error('Erro ao validar hidrocarbonetos:', error);
  process.exit(1);
});
