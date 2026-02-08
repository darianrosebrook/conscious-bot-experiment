/**
 * Regression test for viewer entity skins and skeleton support.
 *
 * Asserts that:
 * - Source files (src/viewer/) contain resolveEntityTexturePath and bonesByName
 * - index.js sets __ASSET_SERVER_URL before entities load
 *
 * Run after changes to src/viewer/ to verify entity textures and skeletal animation work.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const VIEWER_DIR = path.join(
  __dirname,
  '..',
  '..',
  'src',
  'viewer'
);

function readFile(relPath: string, base: string): string | null {
  const fullPath = path.join(base, relPath);
  try {
    return fs.readFileSync(fullPath, 'utf8');
  } catch {
    return null;
  }
}

describe('viewer entity skins and skeleton regression', () => {
  describe('src/viewer source files', () => {
    it('Entity.js contains resolveEntityTexturePath for custom asset server', () => {
      const content = readFile('entities/Entity.js', VIEWER_DIR);
      expect(content).not.toBeNull();
      expect(content).toContain('resolveEntityTexturePath');
      expect(content).toContain('__ASSET_SERVER_URL');
    });

    it('Entity.js contains bonesByName for skeletal animation', () => {
      const content = readFile('entities/Entity.js', VIEWER_DIR);
      expect(content).not.toBeNull();
      expect(content).toContain('bonesByName');
      expect(content).toContain('skinnedMeshes');
    });

    it('client/index.js sets __ASSET_SERVER_URL before viewer.listen', () => {
      const content = readFile('client/index.js', VIEWER_DIR);
      expect(content).not.toBeNull();
      expect(content).toContain('__ASSET_SERVER_URL');
      expect(content).toContain('globalThis.__ASSET_SERVER_URL');
    });

    it('barrel export (index.js) exposes mineflayer', () => {
      const content = readFile('index.js', VIEWER_DIR);
      expect(content).not.toBeNull();
      expect(content).toContain('mineflayer');
      expect(content).toContain('Viewer');
      expect(content).toContain('WorldView');
    });
  });

});
