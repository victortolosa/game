import { GameConfig } from '../GameConfig';

export class PhaseManager {
    constructor(scene) {
        this.scene = scene;
        this.config = GameConfig.PhaseConfig;

        this.currentPhase = 'NORMAL';
        this.chunksSinceChange = 0;
        this.loopIndex = 0;
        this.activePattern = 'NONE';
        this.nextBossThreshold = this.config.Boss.InitialThreshold;

        // State flags
        this.bossActive = false;
        this.pendingBossSpawn = false;
    }

    update(distance, numEnemies) {
        if (this.currentPhase === 'BOSS') {
            // Boss logic handled externally (e.g., when boss dies)
            return;
        }

        // Handle PRE_BOSS completion
        if (this.currentPhase === 'PRE_BOSS') {
            if (this.chunksSinceChange >= this.config.Durations.PRE_BOSS) {
                this.startPhase('BOSS');
            }
            return; // Don't check standard loop or boss trigger while in PRE_BOSS
        }

        // Check Boss Trigger
        if (distance >= this.nextBossThreshold) {
            if (numEnemies === 0) {
                this.startPhase('PRE_BOSS');
                return;
            }
        }

        // Standard Loop Transitions
        const duration = this.config.Durations[this.currentPhase] || 5;
        if (this.chunksSinceChange >= duration) {
            this.advanceLoop();
        }
    }

    advanceLoop() {
        this.loopIndex = (this.loopIndex + 1) % this.config.Loop.length;
        const nextPhase = this.config.Loop[this.loopIndex];
        this.startPhase(nextPhase);
    }

    startPhase(phaseName) {
        console.log(`Phase Transition: ${this.currentPhase} -> ${phaseName}`);
        this.currentPhase = phaseName;
        this.chunksSinceChange = 0;

        if (phaseName === 'CHALLENGE') {
            this.activePattern = Math.random() < 0.5 ? 'NARROW' : 'GATES';
        } else if (phaseName === 'NORMAL') {
            this.activePattern = 'NONE';
        } else if (phaseName === 'BOSS') {
            this.bossActive = true;
            this.pendingBossSpawn = true;
        } else if (phaseName === 'PRE_BOSS') {
            this.activePattern = 'NONE';
        }
    }

    incrementChunk() {
        this.chunksSinceChange++;
    }

    getCurrentConfig() {
        const settings = { ...this.config.Settings[this.currentPhase] };

        // Dynamic overrides
        if (this.currentPhase === 'CHALLENGE') {
            if (this.activePattern === 'NARROW') {
                settings.baseGap = 100;
            } else {
                settings.baseGap = 200;
            }
        } else if (this.currentPhase === 'NORMAL' || this.currentPhase === 'BOSS' || this.currentPhase === 'PRE_BOSS') {
            settings.baseGap = this.scene.width - 80;
        }

        return settings;
    }

    // Force values for debug
    forcePhase(phase, pattern = 'NONE') {
        this.currentPhase = phase;
        this.activePattern = pattern;
        this.chunksSinceChange = 0;
        if (phase === 'BOSS') {
            this.bossActive = true;
            this.pendingBossSpawn = true;
        }
    }
}
