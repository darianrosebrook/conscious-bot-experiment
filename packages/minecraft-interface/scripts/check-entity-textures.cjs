const entities = require('../src/viewer/entities/entities.json');
const names = ['cow', 'chicken', 'cat', 'wolf', 'villager', 'pig', 'sheep', 'iron_golem'];

for (const name of names) {
  const e = entities[name];
  if (!e) { console.log(name + ': NOT IN entities.json'); continue; }
  console.log(name + ':');
  console.log('  textures:', JSON.stringify(e.textures));
  console.log('  geometry keys:', Object.keys(e.geometry || {}));
  const geoKeys = Object.keys(e.geometry || {});
  const texKeys = Object.keys(e.textures || {});
  const mismatches = geoKeys.filter(k => !texKeys.includes(k));
  if (mismatches.length > 0) {
    console.log('  MISMATCH - geometry without texture:', mismatches);
  }
  console.log('');
}
