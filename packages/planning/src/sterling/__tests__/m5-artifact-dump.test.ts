import { describe, it } from 'vitest';
import { decomposeCheckpointableTemplate } from '../building-decomposer';
import { getReducedShelterTemplate, getSimpleShelterTemplate } from '../building-templates-shared';

describe('M5 artifact dump', () => {
  it('dumps reduced shelter decomposition', () => {
    const template = getReducedShelterTemplate();
    const origin = { x: 100, y: 64, z: 200 };
    const result = decomposeCheckpointableTemplate(template, origin);

    console.log('=== REDUCED SHELTER DECOMPOSITION ===');
    console.log(`templateId: ${template.templateId}`);
    console.log(`templateDigest: ${result.templateDigest}`);
    console.log(`totalBlocks: ${result.totalBlocks}`);
    console.log(`totalSteps: ${result.totalSteps}`);
    console.log(`modules: ${result.modules.length}`);
    console.log(`constructionOrder: ${template.constructionOrder.join(' → ')}`);
    console.log('');

    for (const mod of result.modules) {
      console.log(`--- Module: ${mod.moduleId} ---`);
      console.log(`  blocks: ${mod.blocks.length}`);
      console.log(`  steps: ${mod.steps.length} (${mod.steps.length - 1} place_block + 1 verify_module)`);
      console.log(`  witness.witnessDigest: ${mod.witness.witnessDigest}`);
      console.log(`  witness.expectedPlacements: ${mod.witness.expectedPlacements.length}`);
      console.log(`  witness.refCorner: (${mod.witness.refCorner.x},${mod.witness.refCorner.y},${mod.witness.refCorner.z})`);
      console.log(`  witness.facing: ${mod.witness.facing}`);
      console.log(`  first 3 place_block steps:`);
      for (const step of mod.steps.filter(s => (s.meta as any).leaf === 'place_block').slice(0, 3)) {
        const m = step.meta as any;
        console.log(`    order=${step.order} item=${m.args.item} pos=(${m.args.pos.x},${m.args.pos.y},${m.args.pos.z})`);
      }
      const verifyStep = mod.steps.find(s => (s.meta as any).leaf === 'verify_module')!;
      const vm = verifyStep.meta as any;
      console.log(`  checkpoint step: order=${verifyStep.order} leaf=${vm.leaf} isCheckpoint=${vm.isCheckpoint} moduleId=${vm.moduleId}`);
    }
    console.log('');

    // Gravity check artifact
    const placed = new Set<string>();
    for (let x = -5; x <= 20; x++) for (let z = -5; z <= 20; z++) placed.add(`${origin.x+x},${origin.y-1},${origin.z+z}`);
    let unsupported = 0;
    for (const step of result.modules.flatMap(m => m.steps)) {
      const pos = (step.meta as any)?.args?.pos;
      if (!pos) continue;
      const keys = [`${pos.x},${pos.y-1},${pos.z}`,`${pos.x+1},${pos.y},${pos.z}`,`${pos.x-1},${pos.y},${pos.z}`,`${pos.x},${pos.y},${pos.z+1}`,`${pos.x},${pos.y},${pos.z-1}`];
      if (!keys.some(k => placed.has(k))) unsupported++;
      placed.add(`${pos.x},${pos.y},${pos.z}`);
    }
    console.log(`=== GRAVITY CHECK: ${unsupported} unsupported blocks (should be 0) ===`);
  });
});
