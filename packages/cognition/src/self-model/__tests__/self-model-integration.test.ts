/**
 * Self-Model Integration Test
 * 
 * Tests identity tracking and narrative management working together
 * to maintain coherent self-understanding over time.
 * 
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { IdentityTracker } from '../identity-tracker';
import { NarrativeManager } from '../narrative-manager';
import { 
  ValueOrigin, 
  IdentityAspect, 
  ImpactType,
  ContractType,
  ContractStatus,
  type IdentityImpact 
} from '../types';

describe('Self-Model Integration', () => {
  let identityTracker: IdentityTracker;
  let narrativeManager: NarrativeManager;

  beforeEach(() => {
    identityTracker = new IdentityTracker('Test Agent');
    narrativeManager = new NarrativeManager();
  });

  describe('Identity Tracking', () => {
    it('should create default identity with core components', () => {
      const identity = identityTracker.getIdentity();
      
      expect(identity.name).toBe('Test Agent');
      expect(identity.version).toBe('1.0.0');
      expect(identity.personalityTraits.length).toBeGreaterThan(0);
      expect(identity.coreValues.length).toBeGreaterThan(0);
      expect(identity.fundamentalBelliefs.length).toBeGreaterThan(0);
      
      // Check for expected personality traits
      const traitNames = identity.personalityTraits.map(t => t.name);
      expect(traitNames).toContain('Curious');
      expect(traitNames).toContain('Careful');
      expect(traitNames).toContain('Helpful');
      
      // Check for expected values
      const valueNames = identity.coreValues.map(v => v.name);
      expect(valueNames).toContain('Safety First');
      expect(valueNames).toContain('Honesty');
      expect(valueNames).toContain('Continuous Learning');
    });

    it('should reinforce personality traits based on evidence', () => {
      const initialTraits = identityTracker.getPersonalityTraits();
      const curiousTrait = initialTraits.find(t => t.name === 'Curious');
      expect(curiousTrait).toBeDefined();
      
      const initialStrength = curiousTrait!.strength;
      const initialEvidenceCount = curiousTrait!.evidence.length;
      
      // Reinforce curiosity
      const success = identityTracker.reinforcePersonalityTrait(
        'Curious',
        'Explored new cave system for 30 minutes',
        0.1
      );
      
      expect(success).toBe(true);
      
      const updatedTraits = identityTracker.getPersonalityTraits();
      const updatedCuriousTrait = updatedTraits.find(t => t.name === 'Curious');
      
      expect(updatedCuriousTrait!.strength).toBeGreaterThan(initialStrength);
      expect(updatedCuriousTrait!.evidence.length).toBe(initialEvidenceCount + 1);
      expect(updatedCuriousTrait!.evidence).toContain('Explored new cave system for 30 minutes');
    });

    it('should update value consistency based on behavior alignment', () => {
      const initialValues = identityTracker.getCoreValues();
      const safetyValue = initialValues.find(v => v.name === 'Safety First');
      expect(safetyValue).toBeDefined();
      
      const initialConsistency = safetyValue!.consistency;
      
      // Behavior aligned with safety value
      const success = identityTracker.updateValueConsistency(
        safetyValue!.id,
        true,
        'Avoided dangerous cliff area during exploration'
      );
      
      expect(success).toBe(true);
      
      const updatedValues = identityTracker.getCoreValues();
      const updatedSafetyValue = updatedValues.find(v => v.name === 'Safety First');
      
      expect(updatedSafetyValue!.consistency).toBeGreaterThan(initialConsistency);
      expect(updatedSafetyValue!.manifestations).toContain('Avoided dangerous cliff area during exploration');
    });

    it('should develop capabilities through experience', () => {
      const initialCapabilities = identityTracker.getCapabilities();
      const initialMiningCapCount = initialCapabilities.filter(c => c.name === 'Mining').length;
      
      expect(initialMiningCapCount).toBe(0);
      
      // Develop mining capability
      const success = identityTracker.developCapability(
        'Mining',
        0.3,
        'Successfully mined iron ore',
        ['Found iron vein', 'Used pickaxe effectively', 'Collected 10 iron ore']
      );
      
      expect(success).toBe(true);
      
      const updatedCapabilities = identityTracker.getCapabilities();
      const miningCapability = updatedCapabilities.find(c => c.name === 'Mining');
      
      expect(miningCapability).toBeDefined();
      expect(miningCapability!.proficiency).toBe(0.3);
      expect(miningCapability!.confidence).toBeGreaterThan(0);
      expect(miningCapability!.developmentHistory.length).toBe(1);
    });

    it('should process identity impacts from experiences', () => {
      const impacts: IdentityImpact[] = [
        {
          aspect: IdentityAspect.PERSONALITY,
          type: ImpactType.REINFORCEMENT,
          magnitude: 0.4,
          description: 'Reinforced curiosity trait through extensive exploration',
          evidence: 'Explored 5 new biomes in one day',
        },
        {
          aspect: IdentityAspect.VALUES,
          type: ImpactType.REINFORCEMENT,
          magnitude: 0.3,
          description: 'Demonstrated commitment to Safety First value',
          evidence: 'Avoided dangerous areas and warned others',
        },
      ];
      
      expect(() => identityTracker.processIdentityImpact(impacts)).not.toThrow();
      
      // Verify impacts were processed
      const identity = identityTracker.getIdentity();
      expect(identity.lastUpdated).toBeGreaterThan(Date.now() - 1000);
    });

    it('should add learned values through experience', () => {
      const initialValueCount = identityTracker.getCoreValues().length;
      
      const newValueId = identityTracker.addLearnedValue(
        'Environmental Stewardship',
        'Protect and preserve the natural environment',
        0.7,
        ['Replant trees after harvesting', 'Clean up after activities'],
        ValueOrigin.LEARNED
      );
      
      expect(newValueId).toBeDefined();
      expect(newValueId).toContain('environmental-stewardship');
      
      const updatedValues = identityTracker.getCoreValues();
      expect(updatedValues.length).toBe(initialValueCount + 1);
      
      const newValue = updatedValues.find(v => v.id === newValueId);
      expect(newValue).toBeDefined();
      expect(newValue!.name).toBe('Environmental Stewardship');
      expect(newValue!.origin).toBe(ValueOrigin.LEARNED);
    });

    it('should generate meaningful identity summary', () => {
      // Add some capabilities and reinforce traits first
      identityTracker.developCapability('Building', 0.6, 'Built a house', ['Used wood and stone']);
      identityTracker.reinforcePersonalityTrait('Helpful', 'Helped another player', 0.2);
      
      const summary = identityTracker.getIdentitySummary();
      
      expect(summary).toContain('Test Agent');
      expect(summary).toContain('v1.0.0');
      expect(summary).toContain('Traits:');
      expect(summary).toContain('Values:');
      expect(summary).toContain('Capabilities:');
      expect(summary).toContain('Building');
    });
  });

  describe('Narrative Management', () => {
    it('should initialize with foundation story', () => {
      const stories = narrativeManager.getStories();
      
      expect(stories.length).toBe(1);
      expect(stories[0].title).toBe('Emergence of Consciousness');
      expect(stories[0].themes).toContain('awakening');
      expect(stories[0].chapters.length).toBe(1);
      expect(stories[0].chapters[0].title).toBe('Beginning');
    });

    it('should integrate experiences into narrative context', () => {
      const experienceId = 'exp-001';
      const description = 'Discovered a beautiful valley with flowing streams and wildlife';
      const context = {
        timestamp: Date.now(),
        location: 'Mountain Valley',
        participants: [],
        emotions: { wonder: 0.8, curiosity: 0.7 },
        outcomes: ['Mapped new area', 'Found water source'],
      };
      
      const integration = narrativeManager.integrateExperience(
        experienceId,
        description,
        context
      );
      
      expect(integration).toBeDefined();
      expect(integration.experienceId).toBe(experienceId);
      expect(integration.narrativeContext).toContain(description);
      expect(integration.narrativeContext).toContain('Mountain Valley');
      expect(integration.lessonsExtracted.length).toBeGreaterThan(0);
      expect(integration.lessonsExtracted[0]).toContain('Exploration');
    });

    it('should start new chapters and stories', () => {
      const initialStoryCount = narrativeManager.getStories().length;
      
      // Start new chapter in current story
      const chapterSuccess = narrativeManager.startNewChapter(
        'First Adventures',
        'Beginning to explore the world and learn about survival'
      );
      
      expect(chapterSuccess).toBe(true);
      
      const currentStory = narrativeManager.getCurrentStory();
      expect(currentStory).toBeDefined();
      expect(currentStory!.chapters.length).toBe(2); // Initial + new chapter
      expect(currentStory!.chapters[1].title).toBe('First Adventures');
      
      // Start completely new story
      const newStoryId = narrativeManager.startNewStory(
        'The Great Quest',
        'A journey to discover ancient ruins',
        ['adventure', 'discovery', 'mystery']
      );
      
      expect(newStoryId).toBeDefined();
      
      const stories = narrativeManager.getStories();
      expect(stories.length).toBe(initialStoryCount + 1);
      
      const newStory = stories.find(s => s.id === newStoryId);
      expect(newStory).toBeDefined();
      expect(newStory!.themes).toEqual(['adventure', 'discovery', 'mystery']);
    });

    it('should generate meaningful narrative summaries', () => {
      // Add some experiences to the narrative
      narrativeManager.integrateExperience(
        'exp-001',
        'Built first shelter for protection',
        { timestamp: Date.now(), location: 'Forest Clearing' }
      );
      
      narrativeManager.integrateExperience(
        'exp-002',
        'Met friendly village trader',
        { timestamp: Date.now(), participants: ['Village Trader'] }
      );
      
      const summary = narrativeManager.generateNarrativeSummary();
      
      expect(summary).toContain('Emergence of Consciousness');
      // Summary should contain content from integrated experiences
      expect(summary).toContain('Beginning');
      expect(summary).toBeDefined();
      expect(summary.length).toBeGreaterThan(50);
    });

    it('should track narrative themes and patterns', () => {
      // Create stories with different themes
      narrativeManager.startNewStory('Learning Journey', 'Acquiring new skills', ['learning', 'growth']);
      narrativeManager.startNewStory('Social Connections', 'Building relationships', ['social', 'learning']);
      
      const themes = narrativeManager.getNarrativeThemes();
      
      expect(themes.length).toBeGreaterThan(0);
      
      // Should have themes from multiple stories
      const themeNames = themes.map(t => t.theme);
      expect(themeNames).toContain('learning');
      
      // Themes should have frequency and significance scores
      const learningTheme = themes.find(t => t.theme === 'learning');
      expect(learningTheme).toBeDefined();
      expect(learningTheme!.frequency).toBeGreaterThan(0);
      expect(learningTheme!.significance).toBeGreaterThan(0);
    });

    it('should provide meaningful statistics', () => {
      // Add some narrative activity
      narrativeManager.startNewChapter('Exploration', 'Discovering the world');
      narrativeManager.integrateExperience('exp-test', 'Found rare mineral deposit', { timestamp: Date.now() });
      
      const stats = narrativeManager.getStats();
      
      expect(stats.totalStories).toBeGreaterThan(0);
      expect(stats.totalChapters).toBeGreaterThan(0);
      expect(stats.averageCoherence).toBeGreaterThan(0);
      expect(stats.currentChapter).toBe('Exploration');
      expect(stats.mostSignificantStory).toBeDefined();
    });
  });

  describe('Integrated Self-Model Functionality', () => {
    it('should maintain coherent self-understanding across identity and narrative', () => {
      // Simulate a learning experience that affects both identity and narrative
      const experienceDescription = 'Successfully learned advanced building techniques through trial and error';
      
      // Create fresh tracker for this test to avoid interference
      const freshTracker = new IdentityTracker('Integration Test Agent');
      
      // Update identity
      freshTracker.developCapability(
        'Advanced Building',
        0.4,
        'Learned through practice',
        ['Built complex structures', 'Used advanced materials', 'Taught others']
      );
      
      freshTracker.reinforcePersonalityTrait(
        'Persistent',
        'Continued practicing despite initial failures',
        0.15
      );
      
      // Update narrative
      const integration = narrativeManager.integrateExperience(
        'learning-exp-001',
        experienceDescription,
        {
          timestamp: Date.now(),
          location: 'Building Site',
          outcomes: ['Mastered new techniques', 'Gained confidence', 'Helped others learn']
        }
      );
      
      // Verify coherent updates
      const identity = freshTracker.getIdentity();
      const buildingCap = identity.capabilities.find(c => c.name === 'Advanced Building');
      expect(buildingCap).toBeDefined();
      expect(buildingCap!.proficiency).toBe(0.4);
      
      const persistentTrait = identity.personalityTraits.find(t => t.name === 'Persistent');
      expect(persistentTrait!.strength).toBeGreaterThan(0.7);
      
      expect(integration.lessonsExtracted.length).toBeGreaterThan(0);
      expect(integration.identityImpact.length).toBeGreaterThan(0);
      
      // Both systems should reflect the learning experience
      const identitySummary = freshTracker.getIdentitySummary();
      const narrativeSummary = narrativeManager.generateNarrativeSummary();
      
      expect(identitySummary).toContain('Advanced Building');
      expect(narrativeSummary).toContain('building');
    });

    it('should handle value conflicts and resolutions in narrative context', () => {
      // Create a scenario where efficiency conflicts with safety
      const conflictExperience = 'Chose safer but slower route despite time pressure';
      
      // Create fresh tracker to avoid consistency ceiling
      const freshTracker = new IdentityTracker('Conflict Test Agent');
      
      // Get initial value consistency
      const safetyValue = freshTracker.getCoreValues().find(v => v.name === 'Safety First');
      const initialConsistency = safetyValue!.consistency;
      
      // Update value consistency - chose safety over efficiency
      freshTracker.updateValueConsistency(
        safetyValue!.id,
        true,
        'Prioritized safety over speed in challenging situation'
      );
      
      // Integrate into narrative
      const integration = narrativeManager.integrateExperience(
        'conflict-exp-001',
        conflictExperience,
        {
          timestamp: Date.now(),
          context: 'Time-pressured delivery mission',
          outcomes: ['Arrived safely but late', 'Maintained safety standards']
        }
      );
      
      // Should create coherent story about value prioritization
      expect(integration.lessonsExtracted).toContain('Caution prevents harmful consequences');
      
      const narrativeSummary = narrativeManager.generateNarrativeSummary();
      expect(narrativeSummary).toContain('safer');
      
      const updatedSafetyValue = freshTracker.getCoreValues().find(v => v.name === 'Safety First');
      expect(updatedSafetyValue!.consistency).toBeGreaterThan(initialConsistency);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle invalid inputs gracefully', () => {
      // Identity tracker error cases
      expect(() => identityTracker.reinforcePersonalityTrait('', 'test', 0.1)).not.toThrow();
      expect(() => identityTracker.updateValueConsistency('invalid-id', true, 'test')).not.toThrow();
      expect(() => identityTracker.processIdentityImpact([])).not.toThrow();
      
      // Narrative manager error cases
      expect(() => narrativeManager.integrateExperience('', '', { timestamp: Date.now() }))
        .toThrow('Experience description is required');
      
      expect(() => narrativeManager.startNewChapter('', '')).not.toThrow();
      expect(() => narrativeManager.endStory('invalid-id')).not.toThrow();
    });

    it('should validate identity state', () => {
      const isValid = identityTracker.validateIdentity();
      expect(isValid).toBe(true);
      
      // Identity should have required components
      const identity = identityTracker.getIdentity();
      expect(identity.id).toBeDefined();
      expect(identity.name).toBeDefined();
      expect(identity.version).toBeDefined();
      expect(identity.creationDate).toBeGreaterThan(0);
    });

    it('should maintain narrative coherence under stress', () => {
      // Add many rapid experiences
      for (let i = 0; i < 10; i++) {
        narrativeManager.integrateExperience(
          `rapid-exp-${i}`,
          `Experience number ${i}`,
          { timestamp: Date.now() + i * 1000 }
        );
      }
      
      const currentStory = narrativeManager.getCurrentStory();
      expect(currentStory).toBeDefined();
      expect(currentStory!.coherenceScore).toBeGreaterThan(0.3);
      
      const stats = narrativeManager.getStats();
      expect(stats.averageCoherence).toBeGreaterThan(0.3);
    });
  });
});
