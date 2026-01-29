/**
 * Tests for all 11 skill Behavior Tree definitions
 *
 * Verifies that each BT definition is valid JSON and has the required structure
 * for execution by the BehaviorTreeRunner.
 *
 * @author @darianrosebrook
 */

import fs from 'fs';
import path from 'path';

describe('Skill Behavior Tree Definitions', () => {
  const definitionsDir = path.join(__dirname, '../definitions');

  // List of all expected skill definitions
  const expectedSkills = [
    'opt.shelter_basic',
    'opt.chop_tree_safe',
    'opt.ore_ladder_iron',
    'opt.smelt_iron_basic',
    'opt.craft_tool_tiered',
    'opt.food_pipeline_starter',
    'opt.torch_corridor',
    'opt.bridge_gap_safe',
    'opt.biome_probe',
    'opt.emergency_retreat_and_block',
    'opt.craft_wooden_axe',
  ];

  describe('File Structure', () => {
    it('should have all 11 skill definition files', () => {
      const files = fs.readdirSync(definitionsDir);
      const jsonFiles = files.filter((file) => file.endsWith('.json'));

      // Filter out test files (files ending with .option.json)
      const skillFiles = jsonFiles.filter(
        (file) => !file.endsWith('.option.json')
      );

      expect(skillFiles).toHaveLength(11);

      expectedSkills.forEach((skillId) => {
        const fileName = `${skillId.replace('opt.', '')}.json`;
        expect(skillFiles).toContain(fileName);
      });
    });
  });

  describe('JSON Structure Validation', () => {
    expectedSkills.forEach((skillId) => {
      const fileName = `${skillId.replace('opt.', '')}.json`;
      const filePath = path.join(definitionsDir, fileName);

      it(`should have valid JSON structure for ${skillId}`, () => {
        const content = fs.readFileSync(filePath, 'utf8');
        const definition = JSON.parse(content);

        // Check required top-level fields
        expect(definition).toHaveProperty('id');
        expect(definition).toHaveProperty('name');
        expect(definition).toHaveProperty('description');
        expect(definition).toHaveProperty('root');
        expect(definition).toHaveProperty('metadata');

        // Check ID matches filename
        expect(definition.id).toBe(skillId);

        // Check metadata structure
        expect(definition.metadata).toHaveProperty('timeout');
        expect(definition.metadata).toHaveProperty('retries');
        expect(definition.metadata).toHaveProperty('priority');
        expect(definition.metadata).toHaveProperty('interruptible');

        // Check root node structure
        expect(definition.root).toHaveProperty('type');
        expect(['sequence', 'selector', 'parallel']).toContain(
          definition.root.type
        );
      });
    });
  });

  describe('Node Structure Validation', () => {
    expectedSkills.forEach((skillId) => {
      const fileName = `${skillId.replace('opt.', '')}.json`;
      const filePath = path.join(definitionsDir, fileName);

      it(`should have valid node structure for ${skillId}`, () => {
        const content = fs.readFileSync(filePath, 'utf8');
        const definition = JSON.parse(content);

        // Recursively validate all nodes
        const validateNode = (node: any, path: string = 'root') => {
          expect(node).toHaveProperty('type');
          expect([
            'sequence',
            'selector',
            'parallel',
            'action',
            'condition',
          ]).toContain(node.type);

          if (node.type === 'action') {
            expect(node).toHaveProperty('action');
            expect(node).toHaveProperty('args');
          }

          if (node.type === 'condition') {
            expect(node).toHaveProperty('condition');
          }

          if (['sequence', 'selector', 'parallel'].includes(node.type)) {
            expect(node).toHaveProperty('children');
            expect(Array.isArray(node.children)).toBe(true);
            expect(node.children.length).toBeGreaterThan(0);

            node.children.forEach((child: any, index: number) => {
              validateNode(child, `${path}.children[${index}]`);
            });
          }
        };

        validateNode(definition.root);
      });
    });
  });

  describe('Skill-Specific Validation', () => {
    it('should have appropriate timeouts for different skill types', () => {
      const content = fs.readFileSync(
        path.join(definitionsDir, 'emergency_retreat_and_block.json'),
        'utf8'
      );
      const definition = JSON.parse(content);

      // Emergency skills should have shorter timeouts
      expect(definition.metadata.timeout).toBeLessThanOrEqual(30000);
      expect(definition.metadata.priority).toBe('critical');
      expect(definition.metadata.interruptible).toBe(false);
    });

    it('should have appropriate timeouts for exploration skills', () => {
      const content = fs.readFileSync(
        path.join(definitionsDir, 'biome_probe.json'),
        'utf8'
      );
      const definition = JSON.parse(content);

      // Exploration skills can have longer timeouts
      expect(definition.metadata.timeout).toBeGreaterThanOrEqual(60000);
      expect(definition.metadata.priority).toBe('medium');
      expect(definition.metadata.interruptible).toBe(true);
    });

    it('should have appropriate timeouts for building skills', () => {
      const content = fs.readFileSync(
        path.join(definitionsDir, 'shelter_basic.json'),
        'utf8'
      );
      const definition = JSON.parse(content);

      // Building skills should have moderate timeouts
      expect(definition.metadata.timeout).toBeGreaterThanOrEqual(30000);
      expect(definition.metadata.timeout).toBeLessThanOrEqual(60000);
      expect(definition.metadata.priority).toBe('high');
    });
  });

  describe('Action Consistency', () => {
    it('should use consistent action naming patterns', () => {
      const actionNames = new Set<string>();

      expectedSkills.forEach((skillId) => {
        const fileName = `${skillId.replace('opt.', '')}.json`;
        const filePath = path.join(definitionsDir, fileName);
        const content = fs.readFileSync(filePath, 'utf8');
        const definition = JSON.parse(content);

        const collectActions = (node: any) => {
          if (node.type === 'action') {
            actionNames.add(node.action);
          }
          if (node.children) {
            node.children.forEach(collectActions);
          }
        };

        collectActions(definition.root);
      });

      // Should have a reasonable number of unique actions
      expect(actionNames.size).toBeGreaterThan(10);
      expect(actionNames.size).toBeLessThan(100);

      // Check for common action patterns
      const actionArray = Array.from(actionNames);
      expect(actionArray.some((action) => action.includes('place'))).toBe(true);
      expect(actionArray.some((action) => action.includes('craft'))).toBe(true);
      expect(actionArray.some((action) => action.includes('scan'))).toBe(true);
    });
  });

  describe('Condition Consistency', () => {
    it('should use consistent condition patterns', () => {
      const conditions = new Set<string>();

      expectedSkills.forEach((skillId) => {
        const fileName = `${skillId.replace('opt.', '')}.json`;
        const filePath = path.join(definitionsDir, fileName);
        const content = fs.readFileSync(filePath, 'utf8');
        const definition = JSON.parse(content);

        const collectConditions = (node: any) => {
          if (node.type === 'condition') {
            conditions.add(node.condition);
          }
          if (node.children) {
            node.children.forEach(collectConditions);
          }
        };

        collectConditions(definition.root);
      });

      // Should have various condition types
      const conditionArray = Array.from(conditions);
      expect(conditionArray.some((cond) => cond.includes('has_'))).toBe(true);
      expect(conditionArray.some((cond) => cond.includes('>= '))).toBe(true);
      expect(conditionArray.some((cond) => cond.includes('&&'))).toBe(true);
    });
  });
});
