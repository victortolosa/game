export const GameConfig = {
    UI: {
        FontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    },
    Weapons: {
        NORMAL: {
            damage: 1,
            speed: 25,
            bullets: 1,
            spread: 0,
            recoil: { x: 2.5, y: 1.0, strength: 0.008 }
        },
        SHOTGUN: {
            damage: 1,
            speed: 25,
            baseBullets: 3, // Level 1 starts with 3 bullets
            bulletsPerLevel: 1, // +1 bullet per subsequent level
            spreadPattern: 'FAN', // Layout pattern
            spreadAngle: 0.2, // Base spread angle (radians approx)
            recoil: { x: 2.5, y: 1.0, strength: 0.008 }
        },
        HOMING: {
            damage: 0.33,
            speed: 20, // Slower than normal bullets (25) for better turning control?
            baseBullets: 1,
            bulletsPerLevel: 1,
            turnRate: 0.12, // Radians per frame steering
            searchRadius: 600,
            recoil: { x: 2.0, y: 0.5, strength: 0.005 }
        }
    },
    Passives: {
        REDWALL_HURT_LESS: {
            baseReduction: 0.30,
            reductionPerLevel: 0.06
        },
        YELLOW_OBSTACLE_HEAL: {
            baseHeal: 0.03,
            healPerLevel: 0.01
        }
    },
    Upgrades: {
        MaxLevel: 5,
        // Kills required for the Nth upgrade (0-indexed index in array corresponds to totalUpgradesCount)
        // 0 upgrades done -> need index 0 (3 kills)
        // 1 upgrade done -> need index 1 (5 kills)
        // ...
        KillsPerTier: [5, 8, 15, 30, 40, 50, 70, 90, 100, 175, 300]
    },
    Ammo: {
        Max: 12,
        ReloadOnWall: true
    },
    PhaseConfig: {
        // Standard loop of phases when not in a boss fight
        Loop: ['NORMAL', 'CHALLENGE'],

        // Duration in 'chunks' for each phase
        Durations: {
            NORMAL: 5,
            CHALLENGE: 4,
            PRE_BOSS: 3
        },

        // Boss triggering
        Boss: {
            DistanceInterval: 3000,
            InitialThreshold: 3000
        },

        // Phase specific settings
        Settings: {
            NORMAL: {
                wallTexture: 'wallTexture',
                spikeWallActive: false,
                pathWinding: false,
                obstacles: true,
                enemies: true,
                baseGap: 320 // Will be adjusted relative to width in code
            },
            CHALLENGE: {
                wallTexture: 'wallTexture', // code will handle spike texture override
                spikeWallActive: true,
                pathWinding: true,
                obstacles: true,
                enemies: true,
                baseGap: 200 // NARROW pattern will still override this
            },
            PRE_BOSS: {
                wallTexture: 'wallTexture',
                spikeWallActive: false,
                pathWinding: false,
                obstacles: false,
                enemies: false,
                baseGap: 220
            },
            BOSS: {
                wallTexture: 'bossWallTexture',
                bossWallActive: true,
                spikeWallActive: false,
                pathWinding: false,
                obstacles: false,
                enemies: false,
                baseGap: 320
            }
        }
    }
};
