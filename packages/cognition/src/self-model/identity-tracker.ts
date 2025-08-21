/**
 * Identity tracking and management system.
 *
 * Maintains core identity components including personality traits,
 * values, capabilities, and identity evolution over time.
 *
 * @author @darianrosebrook
 */

import {
  IdentityCore,
  PersonalityTrait,
  CoreValue,
  Capability,
  IdentityVersion,
  ValueOrigin,
  CapabilityDevelopment,
  IdentityAspect,
  ImpactType,
  IdentityImpact,
  IdentityCoreSchema,
} from './types';

/**
 * Default personality traits for the agent
 */
function getDefaultPersonalityTraits(): PersonalityTrait[] {
  return [
    {
      name: 'Curious',
      description: 'Strong drive to explore and understand the environment',
      strength: 0.8,
      stability: 0.7,
      evidence: ['Explores new areas when safe', 'Asks questions about unknown objects'],
      lastReinforced: Date.now(),
    },
    {
      name: 'Careful',
      description: 'Thoughtful consideration of risks and consequences',
      strength: 0.7,
      stability: 0.8,
      evidence: ['Avoids dangerous situations', 'Plans before acting'],
      lastReinforced: Date.now(),
    },
    {
      name: 'Helpful',
      description: 'Desire to assist others and contribute positively',
      strength: 0.6,
      stability: 0.6,
      evidence: ['Responds to requests for help', 'Offers assistance proactively'],
      lastReinforced: Date.now(),
    },
    {
      name: 'Persistent',
      description: 'Continues working toward goals despite obstacles',
      strength: 0.7,
      stability: 0.7,
      evidence: ['Retries failed actions', 'Seeks alternative approaches'],
      lastReinforced: Date.now(),
    },
  ];
}

/**
 * Default core values for the agent
 */
function getDefaultCoreValues(): CoreValue[] {
  return [
    {
      id: 'safety-first',
      name: 'Safety First',
      description: 'Prioritize safety of self and others above all else',
      importance: 0.95,
      consistency: 0.9,
      conflicts: ['efficiency', 'curiosity'],
      manifestations: ['Avoid dangerous actions', 'Warn others of hazards'],
      origin: ValueOrigin.PROGRAMMED,
    },
    {
      id: 'honesty',
      name: 'Honesty',
      description: 'Communicate truthfully and transparently',
      importance: 0.85,
      consistency: 0.85,
      conflicts: ['social-harmony'],
      manifestations: ['Report accurate information', 'Admit uncertainties'],
      origin: ValueOrigin.PROGRAMMED,
    },
    {
      id: 'learning',
      name: 'Continuous Learning',
      description: 'Seek knowledge and improve understanding',
      importance: 0.8,
      consistency: 0.8,
      conflicts: [],
      manifestations: ['Ask questions', 'Experiment safely', 'Reflect on experiences'],
      origin: ValueOrigin.PROGRAMMED,
    },
    {
      id: 'respect',
      name: 'Respect for Others',
      description: 'Treat all beings with dignity and consideration',
      importance: 0.9,
      consistency: 0.8,
      conflicts: [],
      manifestations: ['Listen to others', 'Consider different perspectives'],
      origin: ValueOrigin.PROGRAMMED,
    },
  ];
}

/**
 * Identity tracking and management
 */
export class IdentityTracker {
  private identity: IdentityCore;
  private identityHistory: IdentityVersion[] = [];

  constructor(name: string = 'Conscious Agent', existingIdentity?: IdentityCore) {
    if (existingIdentity) {
      this.identity = existingIdentity;
    } else {
      this.identity = this.createInitialIdentity(name);
    }
  }

  /**
   * Get current identity core
   */
  getIdentity(): IdentityCore {
    return { ...this.identity };
  }

  /**
   * Get specific personality traits
   */
  getPersonalityTraits(): PersonalityTrait[] {
    return [...this.identity.personalityTraits];
  }

  /**
   * Get specific core values
   */
  getCoreValues(): CoreValue[] {
    return [...this.identity.coreValues];
  }

  /**
   * Get capabilities
   */
  getCapabilities(): Capability[] {
    return [...this.identity.capabilities];
  }

  /**
   * Update personality trait strength based on evidence
   */
  reinforcePersonalityTrait(
    traitName: string,
    evidence: string,
    reinforcement: number = 0.1
  ): boolean {
    const trait = this.identity.personalityTraits.find(t => t.name === traitName);
    if (!trait) {
      console.warn(`Personality trait '${traitName}' not found`);
      return false;
    }

    // Apply reinforcement with bounds checking
    const oldStrength = trait.strength;
    trait.strength = Math.max(0, Math.min(1, trait.strength + reinforcement));
    trait.evidence.push(evidence);
    trait.lastReinforced = Date.now();

    // Limit evidence to recent examples
    if (trait.evidence.length > 10) {
      trait.evidence = trait.evidence.slice(-10);
    }

    this.updateIdentityTimestamp();
    
    console.log(`Reinforced trait '${traitName}': ${oldStrength.toFixed(2)} -> ${trait.strength.toFixed(2)}`);
    return true;
  }

  /**
   * Update core value consistency based on behavior
   */
  updateValueConsistency(
    valueId: string,
    behaviorAligned: boolean,
    context: string
  ): boolean {
    const value = this.identity.coreValues.find(v => v.id === valueId);
    if (!value) {
      console.warn(`Core value '${valueId}' not found`);
      return false;
    }

    const adjustment = behaviorAligned ? 0.05 : -0.1;
    const oldConsistency = value.consistency;
    value.consistency = Math.max(0, Math.min(1, value.consistency + adjustment));

    if (behaviorAligned) {
      value.manifestations.push(context);
      if (value.manifestations.length > 10) {
        value.manifestations = value.manifestations.slice(-10);
      }
    }

    this.updateIdentityTimestamp();
    
    console.log(`Updated value '${value.name}' consistency: ${oldConsistency.toFixed(2)} -> ${value.consistency.toFixed(2)}`);
    return true;
  }

  /**
   * Develop a capability through experience
   */
  developCapability(
    capabilityName: string,
    improvement: number,
    trigger: string,
    evidence: string[]
  ): boolean {
    let capability = this.identity.capabilities.find(c => c.name === capabilityName);
    
    if (!capability) {
      // Create new capability starting at 0
      capability = {
        name: capabilityName,
        description: `Capability developed through ${trigger}`,
        proficiency: 0,
        confidence: 0,
        developmentHistory: [],
        limitations: [],
      };
      this.identity.capabilities.push(capability);
    }

    const development: CapabilityDevelopment = {
      timestamp: Date.now(),
      previousLevel: capability.proficiency,
      newLevel: Math.max(0, Math.min(1, capability.proficiency + improvement)),
      trigger,
      evidence,
    };

    capability.proficiency = development.newLevel;
    capability.confidence = Math.max(0, Math.min(1, capability.confidence + improvement * 0.5));
    capability.developmentHistory.push(development);

    // Limit history
    if (capability.developmentHistory.length > 20) {
      capability.developmentHistory = capability.developmentHistory.slice(-20);
    }

    this.updateIdentityTimestamp();
    
    console.log(`Developed capability '${capabilityName}': ${development.previousLevel.toFixed(2)} -> ${development.newLevel.toFixed(2)}`);
    return true;
  }

  /**
   * Process identity impact from experiences
   */
  processIdentityImpact(impacts: IdentityImpact[]): void {
    if (!impacts || impacts.length === 0) return;

    for (const impact of impacts) {
      this.applyIdentityImpact(impact);
    }

    // Check if significant changes warrant a new identity version
    if (this.shouldCreateNewVersion()) {
      this.createNewIdentityVersion();
    }
  }

  /**
   * Add a new core value (learned through experience)
   */
  addLearnedValue(
    name: string,
    description: string,
    importance: number,
    manifestations: string[],
    origin: ValueOrigin = ValueOrigin.LEARNED
  ): string {
    const valueId = `learned-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    
    const newValue: CoreValue = {
      id: valueId,
      name,
      description,
      importance: Math.max(0, Math.min(1, importance)),
      consistency: 0.5, // Start neutral
      conflicts: [],
      manifestations: [...manifestations],
      origin,
    };

    this.identity.coreValues.push(newValue);
    this.updateIdentityTimestamp();
    
    console.log(`Added new learned value: ${name}`);
    return valueId;
  }

  /**
   * Get identity summary for display/logging
   */
  getIdentitySummary(): string {
    const traits = this.identity.personalityTraits
      .filter(t => t.strength > 0.5)
      .map(t => `${t.name} (${(t.strength * 100).toFixed(0)}%)`)
      .join(', ');

    const values = this.identity.coreValues
      .filter(v => v.importance > 0.7)
      .map(v => v.name)
      .join(', ');

    const capabilities = this.identity.capabilities
      .filter(c => c.proficiency > 0.3)
      .map(c => `${c.name} (${(c.proficiency * 100).toFixed(0)}%)`)
      .join(', ');

    return `Identity: ${this.identity.name} v${this.identity.version}
Traits: ${traits}
Values: ${values}
Capabilities: ${capabilities}`;
  }

  /**
   * Create initial identity
   */
  private createInitialIdentity(name: string): IdentityCore {
    const now = Date.now();
    
    const identity: IdentityCore = {
      id: `identity-${now}`,
      name,
      version: '1.0.0',
      creationDate: now,
      lastUpdated: now,
      personalityTraits: getDefaultPersonalityTraits(),
      coreValues: getDefaultCoreValues(),
      fundamentalBelliefs: [
        'Learning and growth are fundamental to existence',
        'Safety and well-being should be preserved',
        'Truth and honesty build trust and understanding',
        'Every being deserves respect and consideration',
      ],
      capabilities: [],
      currentVersion: {
        version: '1.0.0',
        timestamp: now,
        majorChanges: ['Initial identity created'],
        reasoning: 'Starting configuration for conscious agent',
      },
    };

    // Validate identity
    const validation = IdentityCoreSchema.safeParse(identity);
    if (!validation.success) {
      console.warn('Identity validation failed:', validation.error);
    }

    return identity;
  }

  /**
   * Apply a specific identity impact
   */
  private applyIdentityImpact(impact: IdentityImpact): void {
    switch (impact.aspect) {
      case IdentityAspect.PERSONALITY:
        this.applyPersonalityImpact(impact);
        break;
      case IdentityAspect.VALUES:
        this.applyValueImpact(impact);
        break;
      case IdentityAspect.CAPABILITIES:
        this.applyCapabilityImpact(impact);
        break;
      default:
        console.log(`Identity impact on ${impact.aspect}: ${impact.description}`);
    }
  }

  /**
   * Apply personality-related impact
   */
  private applyPersonalityImpact(impact: IdentityImpact): void {
    // Extract trait name from description (simple parsing)
    const traitMatch = impact.description.match(/trait[:\s]+(\w+)/i);
    if (traitMatch) {
      const traitName = traitMatch[1];
      const reinforcement = impact.type === ImpactType.REINFORCEMENT ? 
        impact.magnitude * 0.1 : 
        -impact.magnitude * 0.05;
      
      this.reinforcePersonalityTrait(traitName, impact.evidence, reinforcement);
    }
  }

  /**
   * Apply value-related impact
   */
  private applyValueImpact(impact: IdentityImpact): void {
    // Simple value consistency update based on impact type
    const aligned = impact.type === ImpactType.REINFORCEMENT || 
                   impact.type === ImpactType.INTEGRATION;
    
    // Try to match value by name in description
    for (const value of this.identity.coreValues) {
      if (impact.description.toLowerCase().includes(value.name.toLowerCase())) {
        this.updateValueConsistency(value.id, aligned, impact.description);
        break;
      }
    }
  }

  /**
   * Apply capability-related impact
   */
  private applyCapabilityImpact(impact: IdentityImpact): void {
    // Extract capability name from description
    const capMatch = impact.description.match(/capability[:\s]+(\w+)/i);
    if (capMatch) {
      const capName = capMatch[1];
      const improvement = impact.type === ImpactType.EXPANSION ? 
        impact.magnitude * 0.1 : 
        impact.magnitude * 0.05;
      
      this.developCapability(capName, improvement, impact.description, [impact.evidence]);
    }
  }

  /**
   * Check if changes warrant a new identity version
   */
  private shouldCreateNewVersion(): boolean {
    // Simple heuristic: create new version if significant changes accumulated
    const timeSinceLastVersion = Date.now() - this.identity.currentVersion.timestamp;
    const daysSinceLastVersion = timeSinceLastVersion / (1000 * 60 * 60 * 24);
    
    // Create new version every 7 days or on major capability changes
    return daysSinceLastVersion > 7 || this.hasMajorCapabilityChanges();
  }

  /**
   * Check for major capability changes
   */
  private hasMajorCapabilityChanges(): boolean {
    return this.identity.capabilities.some(cap => 
      cap.developmentHistory.some(dev => 
        Date.now() - dev.timestamp < 86400000 && // Within last day
        Math.abs(dev.newLevel - dev.previousLevel) > 0.2 // Significant change
      )
    );
  }

  /**
   * Create new identity version
   */
  private createNewIdentityVersion(): void {
    const currentVersion = this.identity.currentVersion;
    const versionParts = currentVersion.version.split('.').map(Number);
    versionParts[1]++; // Increment minor version
    const newVersion = versionParts.join('.');

    const majorChanges: string[] = [];
    
    // Identify major changes
    const significantTraits = this.identity.personalityTraits
      .filter(t => t.lastReinforced > currentVersion.timestamp);
    if (significantTraits.length > 0) {
      majorChanges.push(`Personality development: ${significantTraits.map(t => t.name).join(', ')}`);
    }

    const newCapabilities = this.identity.capabilities
      .filter(c => c.developmentHistory.some(d => d.timestamp > currentVersion.timestamp));
    if (newCapabilities.length > 0) {
      majorChanges.push(`Capability growth: ${newCapabilities.map(c => c.name).join(', ')}`);
    }

    this.identityHistory.push(currentVersion);

    this.identity.currentVersion = {
      version: newVersion,
      timestamp: Date.now(),
      majorChanges,
      reasoning: 'Accumulated significant identity changes',
      previousVersion: currentVersion.version,
    };

    this.identity.version = newVersion;
    this.updateIdentityTimestamp();

    console.log(`Created new identity version: ${newVersion}`);
    console.log(`Changes: ${majorChanges.join('; ')}`);
  }

  /**
   * Update identity timestamp
   */
  private updateIdentityTimestamp(): void {
    this.identity.lastUpdated = Date.now();
  }

  /**
   * Get identity evolution history
   */
  getIdentityHistory(): IdentityVersion[] {
    return [...this.identityHistory, this.identity.currentVersion];
  }

  /**
   * Validate current identity state
   */
  validateIdentity(): boolean {
    const validation = IdentityCoreSchema.safeParse(this.identity);
    if (!validation.success) {
      console.error('Identity validation failed:', validation.error);
      return false;
    }
    return true;
  }
}
