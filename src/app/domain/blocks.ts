import { Block, BlockModel, GeoClass } from './types';

/** Tonnes of a block = true volume × density. Never uses visual scale. */
export function tonnesOf(dx: number, dy: number, dz: number, densityTonnesPerM3: number): number {
  return dx * dy * dz * densityTonnesPerM3;
}

export function blockTonnes(model: BlockModel, index: number): number {
  const o = index * 3;
  return tonnesOf(model.size[o], model.size[o + 1], model.size[o + 2], model.density[index]);
}

/** Ore if grade ≥ cutoff (equality counts as ore). Derived, never stored. */
export function isOre(gradeGramsPerTonne: number, cutoffGramsPerTonne: number): boolean {
  return gradeGramsPerTonne >= cutoffGramsPerTonne;
}

export function getBlock(model: BlockModel, index: number): Block {
  const o = index * 3;
  return {
    id: model.ids[index],
    gridIndex: [model.gridIndex[o], model.gridIndex[o + 1], model.gridIndex[o + 2]],
    centerBefore: [model.before[o], model.before[o + 1], model.before[o + 2]],
    size: [model.size[o], model.size[o + 1], model.size[o + 2]],
    densityTonnesPerM3: model.density[index],
    gradeGramsPerTonne: model.grade[index],
    geoClass: model.geoClass[index] as GeoClass,
    tonnes: blockTonnes(model, index),
  };
}

/** Map from stable block id to array index. Built once per model. */
export function buildIdIndex(model: BlockModel): Map<number, number> {
  const map = new Map<number, number>();
  for (let i = 0; i < model.count; i++) map.set(model.ids[i], i);
  return map;
}
