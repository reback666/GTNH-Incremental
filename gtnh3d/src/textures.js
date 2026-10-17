// Single registry of every texture the renderer consumes. esbuild's dataurl
// loader inlines each one, and `buildAtlas` packs them into one atlas.
//
// Every key here must exist in assets/tex/ -- see ASSETS.md for the exact
// resource-pack path each one was extracted from. A missing key fails the
// build on purpose: silent placeholder textures would be worse than an error.

// ---- GT machine bases and casings -----------------------------------------
export { default as machineUlvSide } from "../assets/tex/machine-ulv-side.png";
export { default as machineUlvTop } from "../assets/tex/machine-ulv-top.png";
export { default as machineUlvBottom } from "../assets/tex/machine-ulv-bottom.png";
export { default as machineLvSide } from "../assets/tex/machine-lv-side.png";
export { default as machineLvTop } from "../assets/tex/machine-lv-top.png";
export { default as machineLvBottom } from "../assets/tex/machine-lv-bottom.png";

export { default as casingUlv } from "../assets/tex/casing-ulv.png";
export { default as casingLv } from "../assets/tex/casing-lv.png";
export { default as casingMv } from "../assets/tex/casing-mv.png";
export { default as casingHv } from "../assets/tex/casing-hv.png";
export { default as casingEv } from "../assets/tex/casing-ev.png";
export { default as casingIv } from "../assets/tex/casing-iv.png";
export { default as casingLuv } from "../assets/tex/casing-luv.png";
export { default as casingZpm } from "../assets/tex/casing-zpm.png";
export { default as casingUv } from "../assets/tex/casing-uv.png";

export { default as hullUlvSide } from "../assets/tex/hull-ulv-side.png";
export { default as hullUlvTop } from "../assets/tex/hull-ulv-top.png";
export { default as hullUlvBottom } from "../assets/tex/hull-ulv-bottom.png";

export { default as overlayEnergyIn } from "../assets/tex/overlay-energy-in.png";
export { default as overlayEnergyOut } from "../assets/tex/overlay-energy-out.png";
export { default as overlayHeat } from "../assets/tex/overlay-heat.png";
export { default as overlayVoid } from "../assets/tex/overlay-void.png";
export { default as overlayContamination } from "../assets/tex/overlay-contamination.png";
export { default as waterStill } from "../assets/tex/water-still.png";

export { default as heatproofCasing } from "../assets/tex/casing-heatproof.png";
export { default as brickedFurnaceCasing } from "../assets/tex/casing-bricked-blast-furnace.png";
export { default as brickedFurnaceActive } from "../assets/tex/casing-bricked-blast-furnace-active.png";
export { default as cokeOvenController } from "../assets/tex/controller-coke-oven.png";
export { default as primitiveBlastFurnaceController } from "../assets/tex/controller-primitive-blast-furnace.png";

// ---- machine function overlays --------------------------------------------
// macerator: FRONT + TOP only
export { default as maceratorFront } from "../assets/tex/overlay-macerator-front.png";
export { default as maceratorFrontActive } from "../assets/tex/overlay-macerator-front-active.png";
export { default as maceratorTop } from "../assets/tex/overlay-macerator-top.png";
export { default as maceratorTopActive } from "../assets/tex/overlay-macerator-top-active.png";

// alloy_smelter: FRONT + SIDE + TOP + BOTTOM
export { default as alloySmelterFront } from "../assets/tex/overlay-alloy-smelter-front.png";
export { default as alloySmelterFrontActive } from "../assets/tex/overlay-alloy-smelter-front-active.png";
export { default as alloySmelterSide } from "../assets/tex/overlay-alloy-smelter-side.png";
export { default as alloySmelterSideActive } from "../assets/tex/overlay-alloy-smelter-side-active.png";
export { default as alloySmelterTop } from "../assets/tex/overlay-alloy-smelter-top.png";
export { default as alloySmelterTopActive } from "../assets/tex/overlay-alloy-smelter-top-active.png";
export { default as alloySmelterBottom } from "../assets/tex/overlay-alloy-smelter-bottom.png";
export { default as alloySmelterBottomActive } from "../assets/tex/overlay-alloy-smelter-bottom-active.png";

// compressor / extractor / fluid_heater / wiremill: FRONT + SIDE + TOP
export { default as compressorFront } from "../assets/tex/overlay-compressor-front.png";
export { default as compressorFrontActive } from "../assets/tex/overlay-compressor-front-active.png";
export { default as compressorSide } from "../assets/tex/overlay-compressor-side.png";
export { default as compressorSideActive } from "../assets/tex/overlay-compressor-side-active.png";
export { default as compressorTop } from "../assets/tex/overlay-compressor-top.png";
export { default as compressorTopActive } from "../assets/tex/overlay-compressor-top-active.png";

export { default as extractorFront } from "../assets/tex/overlay-extractor-front.png";
export { default as extractorFrontActive } from "../assets/tex/overlay-extractor-front-active.png";
export { default as extractorSide } from "../assets/tex/overlay-extractor-side.png";
export { default as extractorSideActive } from "../assets/tex/overlay-extractor-side-active.png";
export { default as extractorTop } from "../assets/tex/overlay-extractor-top.png";
export { default as extractorTopActive } from "../assets/tex/overlay-extractor-top-active.png";

export { default as wiremillFront } from "../assets/tex/overlay-wiremill-front.png";
export { default as wiremillFrontActive } from "../assets/tex/overlay-wiremill-front-active.png";
export { default as wiremillSide } from "../assets/tex/overlay-wiremill-side.png";
export { default as wiremillSideActive } from "../assets/tex/overlay-wiremill-side-active.png";
export { default as wiremillTop } from "../assets/tex/overlay-wiremill-top.png";
export { default as wiremillTopActive } from "../assets/tex/overlay-wiremill-top-active.png";

export { default as fluidHeaterFront } from "../assets/tex/overlay-fluid-heater-front.png";
export { default as fluidHeaterFrontActive } from "../assets/tex/overlay-fluid-heater-front-active.png";
export { default as fluidHeaterSide } from "../assets/tex/overlay-fluid-heater-side.png";
export { default as fluidHeaterSideActive } from "../assets/tex/overlay-fluid-heater-side-active.png";
export { default as fluidHeaterTop } from "../assets/tex/overlay-fluid-heater-top.png";
export { default as fluidHeaterTopActive } from "../assets/tex/overlay-fluid-heater-top-active.png";

// ore_washer: FRONT + SIDE only
export { default as oreWasherFront } from "../assets/tex/overlay-ore-washer-front.png";
export { default as oreWasherFrontActive } from "../assets/tex/overlay-ore-washer-front-active.png";
export { default as oreWasherSide } from "../assets/tex/overlay-ore-washer-side.png";
export { default as oreWasherSideActive } from "../assets/tex/overlay-ore-washer-side-active.png";

// electric_furnace / hammer / fluid_solidifier: FRONT only
export { default as electricFurnaceFront } from "../assets/tex/overlay-electric-furnace-front.png";
export { default as electricFurnaceFrontActive } from "../assets/tex/overlay-electric-furnace-front-active.png";
export { default as hammerFront } from "../assets/tex/overlay-hammer-front.png";
export { default as hammerFrontActive } from "../assets/tex/overlay-hammer-front-active.png";
export { default as fluidSolidifierFront } from "../assets/tex/overlay-fluid-solidifier-front.png";
export { default as fluidSolidifierFrontActive } from "../assets/tex/overlay-fluid-solidifier-front-active.png";

// ---- blueprint floor blocks ------------------------------------------------
export { default as floorWhiteConcrete } from "../assets/tex/floor-white-concrete.png";
export { default as floorGrayConcrete } from "../assets/tex/floor-gray-concrete.png";
export { default as floorBlackConcrete } from "../assets/tex/floor-black-concrete.png";
export { default as floorCyanTerracotta } from "../assets/tex/floor-cyan-terracotta.png";
export { default as floorYellowTerracotta } from "../assets/tex/floor-yellow-terracotta.png";
export { default as floorMoss } from "../assets/tex/floor-moss-block.png";
export { default as floorGrass } from "../assets/tex/floor-grass-block.png";
export { default as floorBricks } from "../assets/tex/floor-bricks.png";
export { default as floorIronTrapdoor } from "../assets/tex/floor-iron-trapdoor.png";
export { default as floorFroglight } from "../assets/tex/floor-verdant-froglight.png";
export { default as floorFroglightWarm } from "../assets/tex/floor-pearlescent-froglight.png";
export { default as floorPolishedDiorite } from "../assets/tex/floor-polished-diorite.png";
export { default as floorPolishedGranite } from "../assets/tex/floor-polished-granite.png";
export { default as floorAndesiteSlab } from "../assets/tex/floor-polished-andesite-slab.png";
export { default as floorQuartzSlab } from "../assets/tex/floor-smooth-quartz-slab.png";
export { default as floorDioriteStairs } from "../assets/tex/floor-polished-diorite-stairs.png";

// ---- aliases used by the structures ---------------------------------------
export { default as brick } from "../assets/tex/floor-bricks.png";
