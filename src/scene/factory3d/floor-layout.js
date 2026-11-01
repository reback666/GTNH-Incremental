import {
  FLOOR_LAYERS,
  FLOOR_SIZE,
  block,
  floorIndexAt as blueprintIndexAt,
  floorPaletteNameAt,
} from './blocks.js';
import * as T from './floor-textures.js';

const FLOOR_AIR = 3;
const FLOOR_TILING = 2;
const PLAZA_SIZE = FLOOR_SIZE * FLOOR_TILING;
const FLOOR_APRON = 24;

export { FLOOR_LAYERS, PLAZA_SIZE, FLOOR_APRON };

export const FLOOR_SPECS = [
  block({ tex: T.floorGrayConcrete, name: '灰色混凝土', nameEn: 'Gray Concrete' }),
  block({ tex: T.floorPolishedDiorite, name: '磨制闪长岩', nameEn: 'Polished Diorite' }),
  block({ tex: T.floorDioriteStairs, name: '磨制闪长岩台阶', nameEn: 'Polished Diorite Stairs' }),
  null,
  block({ tex: T.floorPolishedGranite, name: '磨制花岗岩', nameEn: 'Polished Granite' }),
  block({ tex: T.floorBricks, name: '砖块', nameEn: 'Bricks' }),
  block({ tex: T.floorWhiteConcrete, name: '白色混凝土', nameEn: 'White Concrete' }),
  block({ tex: T.floorAndesiteSlab, name: '磨制安山岩台阶', nameEn: 'Polished Andesite Slab' }),
  block({ tex: T.floorQuartzSlab, name: '平滑石英台阶', nameEn: 'Smooth Quartz Slab' }),
  block({ tex: T.floorYellowTerracotta, name: '黄色陶瓦', nameEn: 'Yellow Terracotta' }),
  block({ tex: T.floorBlackConcrete, name: '黑色混凝土', nameEn: 'Black Concrete' }),
  block({ tex: T.floorGrass, name: '草方块', nameEn: 'Grass Block' }),
  block({ tex: T.floorMoss, name: '苔藓块', nameEn: 'Moss Block' }),
  block({ tex: T.floorCyanTerracotta, name: '青色陶瓦', nameEn: 'Cyan Terracotta' }),
  block({ tex: T.floorFroglight, emissive: 0.22, name: '翠绿蛙明灯', nameEn: 'Verdant Froglight' }),
  block({ tex: T.floorIronTrapdoor, name: '铁活板门', nameEn: 'Iron Trapdoor' }),
  block({ tex: T.floorFroglightWarm, emissive: 0.22, name: '珠光蛙明灯', nameEn: 'Pearlescent Froglight' }),
];

export function paletteNameAt(x, z, y = FLOOR_LAYERS - 1) {
  return floorPaletteNameAt(x, z, y);
}

export function floorIndexAt(x, z, y = FLOOR_LAYERS - 1) {
  return blueprintIndexAt(x, z, y);
}

export function placeFloor(world) {
  const baseY = -1;
  const fill = FLOOR_SPECS[0];

  for (let z = -FLOOR_APRON; z < PLAZA_SIZE + FLOOR_APRON; z++) {
    for (let x = -FLOOR_APRON; x < PLAZA_SIZE + FLOOR_APRON; x++) {
      world.set(x, baseY, z, fill, { tag: 'floor' });
    }
  }

  for (let y = 0; y < FLOOR_LAYERS; y++) {
    for (let z = 0; z < PLAZA_SIZE; z++) {
      for (let x = 0; x < PLAZA_SIZE; x++) {
        const idx = blueprintIndexAt(x % FLOOR_SIZE, z % FLOOR_SIZE, y);
        if (idx === FLOOR_AIR) continue;
        world.set(x, baseY + 1 + y, z, FLOOR_SPECS[idx], { tag: 'floor' });
      }
    }
  }
  return baseY;
}
