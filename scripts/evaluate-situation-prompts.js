#!/usr/bin/env node
/**
 * Evaluate enriched situation prompts against the MLX sidecar.
 *
 * Generates 20 mad-lib scenarios per prompt type (idle, social, task),
 * sends each through the same prompt template the real cognition system uses,
 * runs the sanitizer pipeline, and reports quality metrics.
 *
 * Usage:
 *   node scripts/evaluate-situation-prompts.js
 *   node scripts/evaluate-situation-prompts.js --leave-running
 *
 * Expects MLX sidecar on localhost:5002 (or COGNITION_LLM_PORT).
 *
 * @author @darianrosebrook
 */

import { execSync } from 'child_process';
import { performance } from 'perf_hooks';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const host = process.env.COGNITION_LLM_HOST || 'localhost';
const port = process.env.COGNITION_LLM_PORT || '5002';
const baseUrl = `http://${host}:${port}`;
const MODEL = 'gemma3n:e2b';
const TEMP = 0.8;      // matches thought generator
const MAX_TOKENS = 512; // matches thought generator
const SAMPLES = 20;

// ---------------------------------------------------------------------------
// Inline sanitizer (mirrors llm-output-sanitizer.ts exactly)
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT_PREFIXES = [
  'You are my private inner thought',
  'You are an agent',
  'Write exactly one or two short sentences',
  'Say what I notice',
  'Use names that appear in the situation',
  "Only if I'm committing to a concrete action",
];

const GENERIC_FILLER_PATTERNS = [
  /^maintaining awareness of surroundings\.?$/i,
  /^observing surroundings\.?$/i,
  /^monitoring the environment\.?$/i,
  /^staying alert\.?$/i,
  /^keeping watch\.?$/i,
  /^looking around\.?$/i,
  /^nothing to report\.?$/i,
];

function stripCodeFences(text) {
  let r = text;
  r = r.replace(/```[a-zA-Z]*\s*/g, '');
  r = r.replace(/```/g, '');
  return r;
}

function stripSystemPromptLeaks(text) {
  let result = text;
  for (const prefix of SYSTEM_PROMPT_PREFIXES) {
    const lr = result.toLowerCase();
    const lp = prefix.toLowerCase();
    if (lr.startsWith(lp)) {
      let rest = result.slice(prefix.length);
      const sb = rest.match(/[.…;!?]+\s+([A-Z])/);
      if (sb && sb.index !== undefined) {
        rest = rest.slice(sb.index + sb[0].length - 1);
      } else {
        rest = rest.replace(/^[\s.,;:…]+/, '');
        rest = rest.replace(/^(and\s+|that\s+|so\s+|but\s+)/i, '');
      }
      result = rest;
    }
  }
  return result;
}

const ACTION_NORMALIZE_MAP = {
  dig: 'mine', break: 'mine', harvest: 'mine',
  get: 'collect', obtain: 'collect', pickup: 'collect',
  make: 'craft', create: 'craft',
  construct: 'build', assemble: 'build', reinforce: 'build', fortify: 'build',
  locate: 'find', search: 'find', look: 'find', identify: 'find',
  move: 'navigate', go: 'navigate', reach: 'navigate', walk: 'navigate', travel: 'navigate', run: 'navigate',
  observe: 'check', assess: 'check', inspect: 'check', acknowledge: 'check',
  acquire: 'gather', increase: 'gather',
  fix: 'repair', mend: 'repair', restore: 'repair',
  cook: 'smelt',
  hear: 'check', listen: 'check',
};
function normalizeGoalAction(raw) {
  const lower = raw.toLowerCase().replace(/^_+|_+$/g, '');
  return ACTION_NORMALIZE_MAP[lower] ?? lower;
}

function extractGoalTag(text) {
  const wellFormed = /\[GOAL:\s*([a-z_]+)\s+([a-z_\s]+?)(?:\s+(\d+))?\s*\]/i;
  let m = text.match(wellFormed);
  if (m) {
    const action = normalizeGoalAction(m[1]);
    return {
      text: text.replace(wellFormed, '').trim(),
      goal: { action, target: m[2].trim().toLowerCase(), amount: m[3] ? parseInt(m[3]) : null },
    };
  }
  const malformed = /\[GOAL:\s*([a-z_]+)\s+([a-z_\s]+?)(?:\s+(\d+))?\s*$/i;
  m = text.match(malformed);
  if (m) {
    const action = normalizeGoalAction(m[1]);
    return {
      text: text.replace(malformed, '').trim(),
      goal: { action, target: m[2].trim().toLowerCase(), amount: m[3] ? parseInt(m[3]) : null },
    };
  }
  const splitGoal = /\[GOAL:\s*([a-z_]+)\s*\]\s*(.+)/i;
  m = text.match(splitGoal);
  if (m) {
    const action = normalizeGoalAction(m[1]);
    return {
      text: text.replace(splitGoal, '').trim(),
      goal: { action, target: m[2].trim().toLowerCase().replace(/[^a-z_\s]/g, '').trim(), amount: null },
    };
  }
  return { text, goal: null };
}

function truncateDegeneration(text) {
  const words = text.split(/\s+/);
  for (let i = 0; i < words.length - 3; i++) {
    if (words[i].toLowerCase() === words[i+1].toLowerCase() &&
        words[i].toLowerCase() === words[i+2].toLowerCase() &&
        words[i].toLowerCase() === words[i+3].toLowerCase()) {
      return { text: words.slice(0, i + 2).join(' ') + '...', hadDegeneration: true };
    }
  }
  if (words.length >= 9) {
    const tp = new Map();
    for (let i = 0; i <= words.length - 3; i++) {
      const tri = words.slice(i, i + 3).map(w => w.toLowerCase()).join(' ');
      const pos = tp.get(tri) || [];
      pos.push(i);
      tp.set(tri, pos);
    }
    for (const [, pos] of tp) {
      if (pos.length >= 3) {
        return { text: words.slice(0, pos[2]).join(' ') + '...', hadDegeneration: true };
      }
    }
  }
  return { text, hadDegeneration: false };
}

function stripTrailingGarbage(text) {
  let r = text, had = false;
  if (/\s+\d+\s*$/.test(r)) { r = r.replace(/\s+\d+\s*$/, ''); had = true; }
  const ls = r.search(/[.!?][^.!?]*$/);
  if (ls >= 0) {
    const after = r.slice(ls + 1).trim();
    if (after.length > 0) {
      const fw = after.split(/\s+/).filter(w => w.length > 0);
      if (fw.length < 5 && !/[.!?]$/.test(after)) {
        r = r.slice(0, ls + 1);
        had = true;
      }
    }
  }
  return { text: r, hadTrailingGarbage: had };
}

function normalizeWhitespace(t) { return t.replace(/\s+/g, ' ').trim(); }

function isUsableContent(text) {
  const t = text.trim();
  if (t.length < 5) return false;
  for (const p of GENERIC_FILLER_PATTERNS) { if (p.test(t)) return false; }
  return true;
}

function sanitizeLLMOutput(raw) {
  const flags = { hadCodeFences: false, hadSystemPromptLeak: false, hadDegeneration: false, hadTrailingGarbage: false, originalLength: raw.length, cleanedLength: 0 };
  let text = stripCodeFences(raw);
  if (text !== raw) flags.hadCodeFences = true;
  const before = text;
  text = stripSystemPromptLeaks(text);
  if (text !== before) flags.hadSystemPromptLeak = true;
  const g = extractGoalTag(text);
  text = g.text;
  const d = truncateDegeneration(text);
  text = d.text; flags.hadDegeneration = d.hadDegeneration;
  const tr = stripTrailingGarbage(text);
  text = tr.text; flags.hadTrailingGarbage = tr.hadTrailingGarbage;
  text = normalizeWhitespace(text);
  flags.cleanedLength = text.length;
  return { text, goalTag: g.goal, flags };
}

// ---------------------------------------------------------------------------
// Scenario dictionaries (mad-lib style)
// ---------------------------------------------------------------------------
const BIOMES = ['forest', 'plains', 'desert', 'taiga', 'swamp', 'jungle', 'savanna', 'birch_forest', 'dark_forest', 'snowy_plains'];
const WEATHERS = ['clear', 'rain', 'clear', 'clear', 'rain'];  // weighted toward clear
const DIMENSIONS = ['overworld', 'overworld', 'overworld', 'the_nether', 'the_end'];
const TIMES = [
  { tick: 1000,  label: 'Early morning' },
  { tick: 6000,  label: 'Daytime' },
  { tick: 8000,  label: 'Daytime' },
  { tick: 12500, label: 'Sunset approaching' },
  { tick: 15000, label: 'Night time' },
  { tick: 18000, label: 'Night time' },
  { tick: 23000, label: 'Night time' },
];
const INVENTORY_SETS = [
  [],
  [{ count: 3, name: 'oak_log' }, { count: 1, name: 'wooden_pickaxe' }],
  [{ count: 12, name: 'cobblestone' }, { count: 1, name: 'stone_pickaxe' }, { count: 5, name: 'coal' }],
  [{ count: 64, name: 'dirt' }, { count: 32, name: 'oak_planks' }, { count: 1, name: 'iron_pickaxe' }, { count: 8, name: 'iron_ingot' }, { count: 3, name: 'bread' }],
  [{ count: 1, name: 'diamond_sword' }, { count: 1, name: 'shield' }, { count: 4, name: 'cooked_beef' }],
  [{ count: 16, name: 'torch' }, { count: 1, name: 'compass' }, { count: 3, name: 'golden_apple' }],
];
const POSITIONS = [
  { x: 120, y: 65, z: -340 },
  { x: -50, y: 72, z: 200 },
  { x: 300, y: 11, z: -100 },   // underground
  { x: 0, y: -20, z: 50 },      // deep underground
  { x: 80, y: 110, z: -200 },   // high altitude
  { x: -200, y: 63, z: 400 },
];
const HEALTH_VALUES = [4, 8, 12, 16, 20, 20, 20, 14];
const FOOD_VALUES = [3, 7, 12, 18, 20, 20, 15, 9];
const HOSTILE_COUNTS = [0, 0, 0, 1, 2, 3, 0, 0, 5, 0];
const LOG_COUNTS = [0, 0, 3, 8, 15, 0, 0, 5, 0, 0];
const ORE_COUNTS = [0, 0, 0, 4, 0, 12, 0, 0, 6, 0];
const WATER_COUNTS = [0, 1, 0, 0, 3, 0, 0, 1, 0, 0];
const RECENT_EVENTS = [
  null,
  'mined 3 oak logs',
  'took 4 damage from zombie',
  'crafted wooden pickaxe',
  'found a cave entrance',
  'killed a spider',
  'ate cooked beef',
  'placed a torch',
  'discovered iron ore vein',
  'spotted a village in the distance',
];
const STRESS_CONTEXTS = [
  null,
  'Feeling tense — health has been dropping.',
  'Curiosity is high — new area to explore.',
  'Slight unease — hostile mobs detected recently.',
  null,
  null,
];
const ENTITY_TYPES = ['zombie', 'skeleton', 'creeper', 'cow', 'pig', 'villager', 'spider', 'trader_llama', 'enderman', 'wolf'];
const ENTITY_DISTANCES = [3, 5, 8, 12, 15, 20, 25];
const TASK_TITLES = [
  'Gather 10 oak logs',
  'Build a shelter',
  'Mine iron ore',
  'Craft a stone pickaxe',
  'Find food sources',
  'Explore nearby cave',
  'Build a crafting table',
  'Smelt iron ingots',
];
const TASK_PROGRESSES = [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1.0];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ---------------------------------------------------------------------------
// Situation builders (mirrors thought-generator.ts exactly)
// ---------------------------------------------------------------------------
function buildIdleSituation(s) {
  let sit = '';
  if (s.health < 10) sit += `Low health (${s.health}/20). `;
  else if (s.health < 15) sit += `Moderate health (${s.health}/20). `;
  if (s.food !== undefined && s.food < 10) sit += `Hungry (${s.food}/20 food). `;
  if (s.inventory.length === 0) {
    sit += 'Empty inventory. ';
  } else {
    const top = s.inventory.slice(0, 5).map(i => `${i.count} ${i.name}`).join(', ');
    sit += `Carrying: ${top}. `;
  }
  if (s.biome !== 'unknown') sit += `In ${s.biome} biome. `;
  if (s.weather && s.weather !== 'clear') sit += `Weather: ${s.weather}. `;
  if (s.dimension && s.dimension !== 'overworld') sit += `In the ${s.dimension}. `;
  const t = s.timeOfDay;
  if (t >= 0 && t < 6000) sit += 'Early morning. ';
  else if (t >= 6000 && t < 12000) sit += 'Daytime. ';
  else if (t >= 12000 && t < 13000) sit += 'Sunset approaching. ';
  else if (t >= 13000) sit += 'Night time. ';
  if (s.nearbyHostiles > 0) sit += `${s.nearbyHostiles} hostile mob${s.nearbyHostiles > 1 ? 's' : ''} nearby. `;
  if (s.nearbyLogs > 0) sit += `Wood available (${s.nearbyLogs} logs nearby). `;
  if (s.nearbyOres > 0) sit += `Ore deposits nearby (${s.nearbyOres}). `;
  if (s.nearbyWater > 0) sit += 'Water source nearby. ';
  if (s.recentEvent) sit += `Recently: ${s.recentEvent}. `;
  if (s.position) {
    const y = Math.round(s.position.y);
    let pc = `At (${Math.round(s.position.x)}, ${y}, ${Math.round(s.position.z)})`;
    if (y < 0) pc += ' (deep underground)';
    else if (y < 40) pc += ' (underground)';
    else if (y > 100) pc += ' (high altitude)';
    sit += `${pc}. `;
  }
  if (s.stressContext) sit += s.stressContext + ' ';
  return sit || 'Idle with no clear context.';
}

function buildSocialSituation(s) {
  let sit = `A ${s.entityType} (ID: ${s.entityId}) is ${s.entityDistance} blocks away. `;
  if (s.entityHostile) sit += `This ${s.entityType} appears to be hostile. `;
  else sit += `This ${s.entityType} appears to be friendly. `;
  sit += `My current health: ${s.health}/20. `;
  if (s.position) sit += `I'm at (${Math.round(s.position.x)}, ${Math.round(s.position.y)}, ${Math.round(s.position.z)}). `;
  if (s.biome !== 'unknown') sit += `We're in a ${s.biome} biome. `;
  if (s.weather && s.weather !== 'clear') sit += `Weather: ${s.weather}. `;
  if (s.dimension && s.dimension !== 'overworld') sit += `In the ${s.dimension}. `;
  if (s.timeOfDay >= 13000) sit += "It's currently nighttime. ";
  else if (s.timeOfDay >= 12000) sit += 'Sunset approaching. ';
  if (s.nearbyHostiles > 1) sit += `${s.nearbyHostiles} hostile mobs in the area. `;
  if (s.currentTask) sit += `I'm currently working on: "${s.currentTask}". `;
  else sit += "I don't have any active tasks. ";
  if (s.stressContext) sit += s.stressContext + ' ';
  sit += 'Should I acknowledge this entity? Consider social norms, safety, and my current priorities.';
  return sit;
}

function buildTaskSituation(s) {
  let sit = `Working on task: ${s.taskTitle}. `;
  if (s.taskProgress === 0) sit += 'Just starting. ';
  else if (s.taskProgress === 1) sit += 'Task completed successfully. ';
  else sit += `Progress: ${Math.round(s.taskProgress * 100)}%. `;
  sit += `Health: ${s.health}/20. `;
  if (s.position) sit += `Position: (${Math.round(s.position.x)}, ${Math.round(s.position.y)}, ${Math.round(s.position.z)}). `;
  if (s.biome !== 'unknown') sit += `In ${s.biome} biome. `;
  sit += 'What should I focus on for this task?';
  return sit;
}

// ---------------------------------------------------------------------------
// Prompt assembly (mirrors llm-interface.ts exactly)
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are my private inner thought while I'm in the world. Write exactly one or two short sentences in first person.

Say what I notice and what I'm about to do next, based on what's most urgent right now (safety, health, shelter, tools, resources, navigation, social cues). Don't explain or justify.

Only if I'm committing to a concrete action now, end with:
[GOAL: <collect|mine|craft|build|find|explore|navigate|gather|smelt|repair> <target> <amount>]
Use names that appear in the situation. If I'm not committing yet, don't output a goal tag.`;

function buildFullPrompt(situation, goals, recentEvents, agentState, stressContext) {
  const sitWithCtx = stressContext ? `${situation} ${stressContext}` : situation;
  // User prompt portion (from generateInternalThought)
  let userPrompt = `Current situation: ${sitWithCtx}\n\n`;
  if (goals && goals.length) userPrompt += `Current goals: ${goals.join(', ')}\n`;
  if (recentEvents && recentEvents.length) userPrompt += `Recent events: ${recentEvents.slice(0, 3).join('; ')}\n`;
  userPrompt += '\nWhat should I do next?';

  // Full prompt (from buildFullPrompt): system + context + user prompt
  let full = SYSTEM_PROMPT + '\n\n';
  if (goals && goals.length) full += `Current goals: ${goals.join(', ')}\n`;
  if (agentState) full += `Agent state: ${JSON.stringify(agentState)}\n`;
  if (recentEvents && recentEvents.length) full += `Recent experiences: ${recentEvents.slice(0, 3).join('; ')}\n`;
  full += '\n' + userPrompt;
  return full;
}

// ---------------------------------------------------------------------------
// Scenario generators
// ---------------------------------------------------------------------------
function randomScenarioBase() {
  const time = pick(TIMES);
  return {
    health: pick(HEALTH_VALUES),
    food: pick(FOOD_VALUES),
    biome: pick(BIOMES),
    weather: pick(WEATHERS),
    dimension: pick(DIMENSIONS),
    timeOfDay: time.tick,
    inventory: pick(INVENTORY_SETS),
    position: pick(POSITIONS),
    nearbyHostiles: pick(HOSTILE_COUNTS),
    nearbyLogs: pick(LOG_COUNTS),
    nearbyOres: pick(ORE_COUNTS),
    nearbyWater: pick(WATER_COUNTS),
    recentEvent: pick(RECENT_EVENTS),
    stressContext: pick(STRESS_CONTEXTS),
  };
}

function generateIdleScenario() {
  const s = randomScenarioBase();
  const situation = buildIdleSituation(s);
  const goals = s.recentEvent ? ['survive', 'gather resources'] : [];
  const events = s.recentEvent ? [s.recentEvent] : [];
  const prompt = buildFullPrompt(situation, goals, events, {
    health: s.health, food: s.food, position: s.position,
    inventory: s.inventory, biome: s.biome, weather: s.weather,
    timeOfDay: s.timeOfDay, dimension: s.dimension,
  }, s.stressContext);
  return { type: 'idle', situation, prompt, scenario: s };
}

function generateSocialScenario() {
  const s = randomScenarioBase();
  const entityType = pick(ENTITY_TYPES);
  const hostile = ['zombie', 'skeleton', 'creeper', 'spider', 'enderman'].includes(entityType);
  const social = {
    ...s,
    entityType,
    entityId: Math.floor(Math.random() * 9000) + 1000,
    entityDistance: pick(ENTITY_DISTANCES),
    entityHostile: hostile,
    currentTask: Math.random() > 0.5 ? pick(TASK_TITLES) : null,
  };
  const situation = buildSocialSituation(social);
  const goals = social.currentTask ? [social.currentTask] : [];
  const prompt = buildFullPrompt(situation, goals, [], {
    health: s.health, position: s.position, biome: s.biome,
  }, s.stressContext);
  return { type: 'social', situation, prompt, scenario: social };
}

function generateTaskScenario() {
  const s = randomScenarioBase();
  const task = {
    ...s,
    taskTitle: pick(TASK_TITLES),
    taskProgress: pick(TASK_PROGRESSES),
  };
  const situation = buildTaskSituation(task);
  const goals = [task.taskTitle];
  const events = s.recentEvent ? [s.recentEvent] : [];
  const prompt = buildFullPrompt(situation, goals, events, {
    health: s.health, position: s.position, biome: s.biome,
  }, s.stressContext);
  return { type: 'task', situation, prompt, scenario: task };
}

// ---------------------------------------------------------------------------
// LLM call
// ---------------------------------------------------------------------------
async function generate(prompt) {
  const start = performance.now();
  const res = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      stream: false,
      options: { temperature: TEMP, num_predict: MAX_TOKENS },
    }),
  });
  const ms = performance.now() - start;
  if (!res.ok) throw new Error(`MLX ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { raw: data.response || '', ms, promptTokens: data.prompt_eval_count ?? 0, completionTokens: data.eval_count ?? 0 };
}

// ---------------------------------------------------------------------------
// Leakage detection
// ---------------------------------------------------------------------------
const SITUATION_LEAK_PATTERNS = [
  /Current situation:/i,
  /What should I do next\?/i,
  /Agent state:/i,
  /Current goals:/i,
  /\{.*"health".*"food".*\}/,  // raw JSON agent state
  /\{.*"position".*"biome".*\}/,
  /\{.*"inventory".*\}/,
];

function detectLeakage(sanitizedText, situation) {
  const leaks = [];
  for (const p of SITUATION_LEAK_PATTERNS) {
    if (p.test(sanitizedText)) leaks.push(p.source.slice(0, 40));
  }
  // Check if raw situation text leaked into response
  const sitWords = situation.split(/\s+/).filter(w => w.length > 8);
  const longPhrases = [];
  for (let i = 0; i < sitWords.length - 2; i++) {
    const phrase = sitWords.slice(i, i + 3).join(' ');
    if (sanitizedText.includes(phrase)) longPhrases.push(phrase);
  }
  if (longPhrases.length > 2) leaks.push(`situation-echo(${longPhrases.length} phrases)`);
  return leaks;
}

// ---------------------------------------------------------------------------
// Quality checks
// ---------------------------------------------------------------------------
function assessQuality(sanitizedText, goalTag, flags, scenario) {
  const issues = [];
  const good = [];

  // First person check
  if (/\b(I |I'm |I'll |I've |I'd |my |me )/i.test(sanitizedText)) {
    good.push('first-person');
  } else {
    issues.push('not-first-person');
  }

  // Length check: 1-2 sentences = roughly 10-80 words
  const wordCount = sanitizedText.split(/\s+/).filter(w => w.length > 0).length;
  if (wordCount > 80) issues.push(`too-long(${wordCount}w)`);
  else if (wordCount < 3) issues.push(`too-short(${wordCount}w)`);
  else good.push(`good-length(${wordCount}w)`);

  // Sentence count
  const sentences = sanitizedText.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length > 4) issues.push(`too-many-sentences(${sentences.length})`);

  // Goal tag quality
  if (goalTag) {
    if (['collect', 'mine', 'craft', 'build', 'find', 'explore', 'navigate', 'gather', 'check', 'continue', 'smelt', 'repair'].includes(goalTag.action)) {
      good.push(`valid-goal(${goalTag.action}:${goalTag.target})`);
    } else {
      issues.push(`unknown-goal-action(${goalTag.action})`);
    }
  }

  // Context awareness: does the response reference scenario elements?
  const text = sanitizedText.toLowerCase();
  if (scenario.nearbyHostiles > 0 && /(hostile|mob|zombie|skeleton|creeper|spider|danger|threat|safe)/i.test(text)) {
    good.push('threat-aware');
  }
  if (scenario.health < 10 && /(health|heal|hurt|damage|careful|danger)/i.test(text)) {
    good.push('health-aware');
  }
  if (scenario.inventory?.length > 0 && scenario.inventory.some(i => text.includes(i.name.replace(/_/g, ' ')) || text.includes(i.name))) {
    good.push('inventory-aware');
  }
  if (scenario.nearbyLogs > 0 && /(wood|log|tree|chop)/i.test(text)) {
    good.push('resource-aware');
  }

  // Degeneration / sanitization flags
  if (flags.hadDegeneration) issues.push('degeneration');
  if (flags.hadSystemPromptLeak) issues.push('system-prompt-leak');
  if (flags.hadCodeFences) issues.push('code-fences');
  if (flags.hadTrailingGarbage) issues.push('trailing-garbage');

  return { issues, good, wordCount, sentenceCount: sentences.length };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function checkPort(p) {
  try { execSync(`lsof -Pi :${p} -sTCP:LISTEN -t`, { stdio: 'ignore' }); return true; }
  catch { return false; }
}

async function main() {
  if (!checkPort(port)) {
    console.error(`MLX sidecar not running on port ${port}. Start it first or run benchmark:mlx.`);
    process.exit(1);
  }
  console.log(`Evaluating situation prompts against ${baseUrl} (model: ${MODEL})\n`);

  const generators = [
    { name: 'idle', gen: generateIdleScenario },
    { name: 'social', gen: generateSocialScenario },
    { name: 'task', gen: generateTaskScenario },
  ];

  const allResults = [];

  for (const { name, gen } of generators) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`  ${name.toUpperCase()} SCENARIOS (${SAMPLES} samples)`);
    console.log(`${'='.repeat(70)}`);

    const results = [];
    for (let i = 0; i < SAMPLES; i++) {
      const scenario = gen();
      process.stderr.write(`  ${name} #${i + 1}/${SAMPLES} ... `);

      try {
        const llm = await generate(scenario.prompt);
        const sanitized = sanitizeLLMOutput(llm.raw);
        const usable = isUsableContent(sanitized.text);
        const leaks = detectLeakage(sanitized.text, scenario.situation);
        const quality = assessQuality(sanitized.text, sanitized.goalTag, sanitized.flags, scenario.scenario);

        const result = {
          index: i + 1,
          type: name,
          situation: scenario.situation,
          promptLength: scenario.prompt.length,
          rawResponse: llm.raw,
          sanitizedText: sanitized.text,
          goalTag: sanitized.goalTag,
          flags: sanitized.flags,
          usable,
          leaks,
          quality,
          latencyMs: Math.round(llm.ms),
          promptTokens: llm.promptTokens,
          completionTokens: llm.completionTokens,
        };

        results.push(result);
        allResults.push(result);

        const statusParts = [];
        if (!usable) statusParts.push('UNUSABLE');
        if (leaks.length) statusParts.push(`LEAK(${leaks.length})`);
        if (quality.issues.length) statusParts.push(quality.issues.join(','));
        if (sanitized.goalTag) statusParts.push(`GOAL:${sanitized.goalTag.action}`);
        const status = statusParts.length ? statusParts.join(' | ') : 'OK';

        process.stderr.write(`${Math.round(llm.ms)}ms ${status}\n`);

        // Print abbreviated output
        const shortSit = scenario.situation.length > 100 ? scenario.situation.slice(0, 100) + '...' : scenario.situation;
        const shortResp = sanitized.text.length > 120 ? sanitized.text.slice(0, 120) + '...' : sanitized.text;
        console.log(`  #${String(i+1).padStart(2)} SIT: ${shortSit}`);
        console.log(`       RSP: ${shortResp}`);
        if (sanitized.goalTag) console.log(`       GOAL: ${JSON.stringify(sanitized.goalTag)}`);
        if (leaks.length) console.log(`       LEAKS: ${leaks.join(', ')}`);
        if (quality.issues.length) console.log(`       ISSUES: ${quality.issues.join(', ')}`);
        if (quality.good.length) console.log(`       GOOD: ${quality.good.join(', ')}`);
        console.log();
      } catch (e) {
        process.stderr.write(`FAIL: ${e.message}\n`);
        results.push({ index: i + 1, type: name, error: e.message });
        allResults.push({ index: i + 1, type: name, error: e.message });
      }
    }

    // Per-type summary
    const ok = results.filter(r => !r.error);
    if (ok.length === 0) { console.log('  All failed.\n'); continue; }
    const usableCount = ok.filter(r => r.usable).length;
    const leakCount = ok.filter(r => r.leaks?.length > 0).length;
    const goalCount = ok.filter(r => r.goalTag).length;
    const degenCount = ok.filter(r => r.flags?.hadDegeneration).length;
    const promptLeakCount = ok.filter(r => r.flags?.hadSystemPromptLeak).length;
    const fenceCount = ok.filter(r => r.flags?.hadCodeFences).length;
    const garbageCount = ok.filter(r => r.flags?.hadTrailingGarbage).length;
    const avgLatency = Math.round(ok.reduce((a, r) => a + r.latencyMs, 0) / ok.length);
    const avgWords = Math.round(ok.reduce((a, r) => a + r.quality.wordCount, 0) / ok.length);
    const firstPersonCount = ok.filter(r => r.quality.good.includes('first-person')).length;
    const threatAwareCount = ok.filter(r => r.quality.good.includes('threat-aware')).length;
    const healthAwareCount = ok.filter(r => r.quality.good.includes('health-aware')).length;
    const resourceAwareCount = ok.filter(r => r.quality.good.includes('resource-aware')).length;
    const inventoryAwareCount = ok.filter(r => r.quality.good.includes('inventory-aware')).length;

    // Count how many had the relevant scenario condition
    const hadThreats = ok.filter(r => r.scenario?.nearbyHostiles > 0 || (r.type === 'social' && r.scenario?.entityHostile)).length;
    const hadLowHealth = ok.filter(r => r.scenario?.health < 10).length;
    const hadResources = ok.filter(r => r.scenario?.nearbyLogs > 0).length;
    const hadInventory = ok.filter(r => r.scenario?.inventory?.length > 0).length;

    console.log(`  --- ${name.toUpperCase()} SUMMARY ---`);
    console.log(`  Samples: ${ok.length}/${SAMPLES}  |  Usable: ${usableCount}/${ok.length} (${pct(usableCount, ok.length)})`);
    console.log(`  Avg latency: ${avgLatency}ms  |  Avg words: ${avgWords}`);
    console.log(`  First-person: ${firstPersonCount}/${ok.length} (${pct(firstPersonCount, ok.length)})`);
    console.log(`  Goal extracted: ${goalCount}/${ok.length} (${pct(goalCount, ok.length)})`);
    console.log(`  Leakage detected: ${leakCount}/${ok.length} (${pct(leakCount, ok.length)})`);
    console.log(`  Sanitization: fences=${fenceCount} prompt-leak=${promptLeakCount} degen=${degenCount} garbage=${garbageCount}`);
    console.log(`  Context awareness:`);
    console.log(`    Threat-aware: ${threatAwareCount}/${hadThreats || '?'} relevant  |  Health-aware: ${healthAwareCount}/${hadLowHealth || '?'} relevant`);
    console.log(`    Resource-aware: ${resourceAwareCount}/${hadResources || '?'} relevant  |  Inventory-aware: ${inventoryAwareCount}/${hadInventory || '?'} relevant`);
    console.log();
  }

  // ---------------------------------------------------------------------------
  // Grand summary
  // ---------------------------------------------------------------------------
  const ok = allResults.filter(r => !r.error);
  const total = allResults.length;
  console.log(`\n${'='.repeat(70)}`);
  console.log('  GRAND SUMMARY');
  console.log(`${'='.repeat(70)}`);
  console.log(`  Total samples: ${total}  |  Succeeded: ${ok.length}  |  Failed: ${total - ok.length}`);
  console.log(`  Usable: ${ok.filter(r => r.usable).length}/${ok.length} (${pct(ok.filter(r=>r.usable).length, ok.length)})`);
  console.log(`  First-person: ${ok.filter(r => r.quality?.good?.includes('first-person')).length}/${ok.length}`);
  console.log(`  Goal extracted: ${ok.filter(r => r.goalTag).length}/${ok.length}`);
  console.log(`  Leakage detected: ${ok.filter(r => r.leaks?.length > 0).length}/${ok.length}`);
  console.log(`  Degeneration: ${ok.filter(r => r.flags?.hadDegeneration).length}/${ok.length}`);
  console.log(`  System prompt leak: ${ok.filter(r => r.flags?.hadSystemPromptLeak).length}/${ok.length}`);
  console.log(`  Code fences: ${ok.filter(r => r.flags?.hadCodeFences).length}/${ok.length}`);
  console.log(`  Trailing garbage: ${ok.filter(r => r.flags?.hadTrailingGarbage).length}/${ok.length}`);
  console.log(`  Avg latency: ${Math.round(ok.reduce((a,r) => a + r.latencyMs, 0) / ok.length)}ms`);
  console.log(`  Avg word count: ${Math.round(ok.reduce((a,r) => a + r.quality.wordCount, 0) / ok.length)}`);

  // Leakage detail
  const leakyResults = ok.filter(r => r.leaks?.length > 0);
  if (leakyResults.length > 0) {
    console.log(`\n  LEAKAGE DETAILS (${leakyResults.length} samples):`);
    for (const r of leakyResults) {
      console.log(`    ${r.type} #${r.index}: ${r.leaks.join(', ')}`);
      console.log(`      Response: ${r.sanitizedText.slice(0, 100)}...`);
    }
  }

  console.log();
}

function pct(n, total) { return total > 0 ? `${Math.round(n / total * 100)}%` : '0%'; }

main().catch(e => { console.error(e); process.exit(1); });
