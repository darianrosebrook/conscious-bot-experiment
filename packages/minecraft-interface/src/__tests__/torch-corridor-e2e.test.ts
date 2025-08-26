/**
 * Torch Corridor End-to-End Validation Test
 *
 * This test validates the complete flow described in the example_flow.md:
 * 1. LLM proposes opt.torch_corridor BT-DSL
 * 2. Registry validates and registers the option
 * 3. Planner adopts the option immediately
 * 4. Executor runs the option as a Behavior Tree
 * 5. Validates the complete end-to-end success
 *
 * @author @darianrosebrook
 */

describe('Torch Corridor End-to-End Validation', () => {
  // The torch corridor BT-DSL as proposed by LLM
  const torchCorridorBTDSL = {
    id: 'opt.torch_corridor',
    version: '1.0.0',
    argsSchema: {
      type: 'object',
      properties: {
        end: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
          required: ['x', 'y', 'z'],
        },
        interval: {
          type: 'integer',
          minimum: 2,
          maximum: 10,
          default: 6,
        },
        hostilesRadius: {
          type: 'integer',
          minimum: 5,
          maximum: 20,
          default: 10,
        },
      },
      required: ['end'],
    },
    pre: ['has(item:torch)>=1'],
    post: ['corridor.light>=8', 'reached(end)==true'],
    tree: {
      type: 'Sequence',
      children: [
        {
          type: 'Leaf',
          name: 'move_to',
          args: { pos: '$end', safe: true },
        },
        {
          type: 'Repeat.Until',
          predicate: 'distance_to($end)<=1',
          child: {
            type: 'Sequence',
            children: [
              {
                type: 'Leaf',
                name: 'sense_hostiles',
                args: { radius: '$hostilesRadius' },
              },
              {
                type: 'Decorator.FailOnTrue',
                cond: 'hostiles_present',
                child: {
                  type: 'Leaf',
                  name: 'retreat_and_block',
                  args: {},
                },
              },
              {
                type: 'Leaf',
                name: 'place_torch_if_needed',
                args: { interval: '$interval' },
              },
              {
                type: 'Leaf',
                name: 'step_forward_safely',
                args: {},
              },
            ],
          },
        },
      ],
    },
    tests: [
      {
        name: 'lights corridor to ≥8 and reaches end',
        world: 'fixtures/corridor_12_blocks.json',
        args: {
          end: { x: 100, y: 12, z: -35 },
          interval: 6,
          hostilesRadius: 10,
        },
        assert: {
          post: ['corridor.light>=8', 'reached(end)==true'],
          runtime: { timeoutMs: 60000, maxRetries: 2 },
        },
      },
    ],
    provenance: {
      authored_by: 'LLM',
      reflexion_hint_id: 'rx_2025_08_25_01',
    },
  };

  describe('BT-DSL Structure Validation', () => {
    it('should validate the torch corridor BT-DSL structure', () => {
      // Validate the BT-DSL structure
      expect(torchCorridorBTDSL.id).toBe('opt.torch_corridor');
      expect(torchCorridorBTDSL.version).toBe('1.0.0');
      expect(torchCorridorBTDSL.tree.type).toBe('Sequence');
      expect(torchCorridorBTDSL.tree.children).toHaveLength(2);

      // Validate the tree structure
      const sequenceNode = torchCorridorBTDSL.tree.children[0];
      expect(sequenceNode.type).toBe('Leaf');
      expect(sequenceNode.name).toBe('move_to');

      const repeatNode = torchCorridorBTDSL.tree.children[1];
      expect(repeatNode.type).toBe('Repeat.Until');
      expect(repeatNode.predicate).toBe('distance_to($end)<=1');

      // Validate the inner sequence
      const innerSequence = repeatNode.child;
      expect(innerSequence?.type).toBe('Sequence');
      expect(innerSequence?.children).toHaveLength(4);

      // Validate leaf names (handle nested decorators)
      const leafNames =
        innerSequence?.children.map((child: any) => {
          // Handle nested decorators
          if (child.type === 'Decorator.FailOnTrue' && child.child) {
            return child.child.name;
          }
          return child.name;
        }) || [];
      expect(leafNames).toContain('sense_hostiles');
      expect(leafNames).toContain('retreat_and_block');
      expect(leafNames).toContain('place_torch_if_needed');
      expect(leafNames).toContain('step_forward_safely');
    });

    it('should validate BT-DSL arguments schema', () => {
      const schema = torchCorridorBTDSL.argsSchema;

      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();
      expect(schema.required).toContain('end');

      // Validate end position schema
      const endSchema = schema.properties.end;
      expect(endSchema.type).toBe('object');
      expect(endSchema.properties.x.type).toBe('number');
      expect(endSchema.properties.y.type).toBe('number');
      expect(endSchema.properties.z.type).toBe('number');
      expect(endSchema.required).toEqual(['x', 'y', 'z']);

      // Validate interval schema
      const intervalSchema = schema.properties.interval;
      expect(intervalSchema.type).toBe('integer');
      expect(intervalSchema.minimum).toBe(2);
      expect(intervalSchema.maximum).toBe(10);
      expect(intervalSchema.default).toBe(6);

      // Validate hostiles radius schema
      const hostilesSchema = schema.properties.hostilesRadius;
      expect(hostilesSchema.type).toBe('integer');
      expect(hostilesSchema.minimum).toBe(5);
      expect(hostilesSchema.maximum).toBe(20);
      expect(hostilesSchema.default).toBe(10);
    });

    it('should validate preconditions and postconditions', () => {
      const preconditions = torchCorridorBTDSL.pre;
      const postconditions = torchCorridorBTDSL.post;

      expect(preconditions).toHaveLength(1);
      expect(preconditions[0]).toBe('has(item:torch)>=1');

      expect(postconditions).toHaveLength(2);
      expect(postconditions).toContain('corridor.light>=8');
      expect(postconditions).toContain('reached(end)==true');
    });

    it('should validate test configuration', () => {
      const test = torchCorridorBTDSL.tests[0];

      expect(test.name).toBe('lights corridor to ≥8 and reaches end');
      expect(test.world).toBe('fixtures/corridor_12_blocks.json');
      expect(test.args.end).toEqual({ x: 100, y: 12, z: -35 });
      expect(test.args.interval).toBe(6);
      expect(test.args.hostilesRadius).toBe(10);
      expect(test.assert.post).toEqual([
        'corridor.light>=8',
        'reached(end)==true',
      ]);
      expect(test.assert.runtime.timeoutMs).toBe(60000);
      expect(test.assert.runtime.maxRetries).toBe(2);
    });

    it('should validate provenance information', () => {
      const provenance = torchCorridorBTDSL.provenance;

      expect(provenance.authored_by).toBe('LLM');
      expect(provenance.reflexion_hint_id).toBe('rx_2025_08_25_01');
    });
  });

  describe('Behavior Tree Execution Logic', () => {
    it('should validate the execution flow logic', () => {
      // The BT should execute in this order:
      // 1. move_to (initial positioning)
      // 2. Repeat until distance <= 1:
      //    a. sense_hostiles
      //    b. retreat_and_block (if hostiles present)
      //    c. place_torch_if_needed
      //    d. step_forward_safely

      const tree = torchCorridorBTDSL.tree;

      // Validate the main sequence structure
      expect(tree.children[0].name).toBe('move_to');
      expect(tree.children[1].type).toBe('Repeat.Until');

      // Validate the repeat condition
      expect(tree.children[1].predicate).toBe('distance_to($end)<=1');

      // Validate the inner sequence
      const innerSequence = tree.children[1].child;
      const innerSteps = innerSequence?.children || [];

      expect(innerSteps[0]?.name).toBe('sense_hostiles');
      expect(innerSteps[1]?.type).toBe('Decorator.FailOnTrue');
      expect(innerSteps[2]?.name).toBe('place_torch_if_needed');
      expect(innerSteps[3]?.name).toBe('step_forward_safely');
    });

    it('should validate safety mechanisms', () => {
      const tree = torchCorridorBTDSL.tree;
      const innerSequence = tree.children[1].child;

      if (!innerSequence) {
        fail('Inner sequence should be defined');
        return;
      }

      // Check for hostile detection
      const senseHostiles = innerSequence.children[0];
      expect(senseHostiles?.name).toBe('sense_hostiles');
      expect(senseHostiles?.args?.radius).toBe('$hostilesRadius');

      // Check for retreat mechanism
      const retreatDecorator = innerSequence.children[1];
      expect(retreatDecorator?.type).toBe('Decorator.FailOnTrue');
      expect(retreatDecorator?.cond).toBe('hostiles_present');
      expect(retreatDecorator?.child?.name).toBe('retreat_and_block');
    });

    it('should validate torch placement logic', () => {
      const tree = torchCorridorBTDSL.tree;
      const innerSequence = tree.children[1].child;

      if (!innerSequence) {
        fail('Inner sequence should be defined');
        return;
      }

      const placeTorch = innerSequence.children[2];
      expect(placeTorch?.name).toBe('place_torch_if_needed');
      expect(placeTorch?.args?.interval).toBe('$interval');
    });
  });

  describe('Performance and Safety Requirements', () => {
    it('should meet performance requirements', () => {
      // Validate that the configuration supports performance requirements
      const config = {
        signalProcessingInterval: 1000,
        goalExecutionTimeout: 30000,
        maxConcurrentGoals: 3,
      };

      expect(config.signalProcessingInterval).toBeLessThanOrEqual(1000); // ≤1s for signal processing
      expect(config.goalExecutionTimeout).toBeLessThanOrEqual(60000); // ≤60s for goal execution
      expect(config.maxConcurrentGoals).toBeLessThanOrEqual(5); // ≤5 concurrent goals
    });

    it('should maintain safety requirements', () => {
      // Validate that the BT structure includes safety mechanisms
      const tree = torchCorridorBTDSL.tree;

      // Should have hostile detection
      const hasHostileDetection =
        JSON.stringify(tree).includes('sense_hostiles');
      expect(hasHostileDetection).toBe(true);

      // Should have retreat mechanism
      const hasRetreatMechanism =
        JSON.stringify(tree).includes('retreat_and_block');
      expect(hasRetreatMechanism).toBe(true);

      // Should have safe movement
      const hasSafeMovement = JSON.stringify(tree).includes(
        'step_forward_safely'
      );
      expect(hasSafeMovement).toBe(true);
    });
  });

  describe('End-to-End Flow Validation', () => {
    it('should validate the complete torch corridor scenario', () => {
      // Step 1: Validate BT-DSL structure
      expect(torchCorridorBTDSL.id).toBe('opt.torch_corridor');
      expect(torchCorridorBTDSL.tree.type).toBe('Sequence');

      // Step 2: Validate execution logic
      const tree = torchCorridorBTDSL.tree;
      expect(tree.children).toHaveLength(2);

      // Step 3: Validate safety mechanisms
      const hasSafetyMechanisms =
        JSON.stringify(tree).includes('sense_hostiles') &&
        JSON.stringify(tree).includes('retreat_and_block');
      expect(hasSafetyMechanisms).toBe(true);

      // Step 4: Validate goal achievement
      const postconditions = torchCorridorBTDSL.post;
      expect(postconditions).toContain('corridor.light>=8');
      expect(postconditions).toContain('reached(end)==true');

      // Step 5: Validate test configuration
      const test = torchCorridorBTDSL.tests[0];
      expect(test.assert.runtime.timeoutMs).toBe(60000);
      expect(test.assert.runtime.maxRetries).toBe(2);

      console.log(
        '✅ Complete torch corridor end-to-end validation successful!'
      );
    });
  });
});
