import Phaser from 'phaser';

export const EnemyType = {
    SMALL: 'SMALL',
    BIG: 'BIG'
} as const;

export type EnemyType = typeof EnemyType[keyof typeof EnemyType];

export interface EnemyConfig {
    type: EnemyType;
    speed: number;
    health: number;
    color: number;
    size: number;
}

export const ENEMY_CONFIGS: Record<EnemyType, EnemyConfig> = {
    [EnemyType.SMALL]: {
        type: EnemyType.SMALL,
        speed: 50,
        health: 1,
        color: 0xff0000, // Red
        size: 20
    },
    [EnemyType.BIG]: {
        type: EnemyType.BIG,
        speed: 20,
        health: 3,
        color: 0x880000, // Dark Red
        size: 40
    }
};

export default class Enemy extends Phaser.Physics.Arcade.Sprite {
    private hp: number = 1;
    private speed: number = 0;
    public enemyType: EnemyType = EnemyType.SMALL;
    private onEscape?: () => void;
    private onDeath?: () => void;

    constructor(scene: Phaser.Scene, x: number, y: number) {
        super(scene, x, y, 'enemy'); // Texture will be generated or set later

        // Add to scene and physics
        scene.add.existing(this);
        scene.physics.add.existing(this);
    }

    public spawn(x: number, y: number, type: EnemyType, onEscape: () => void, onDeath: () => void, speedMult: number = 1.0) {
        const config = ENEMY_CONFIGS[type];

        this.enemyType = type;
        this.hp = config.health;
        this.speed = config.speed * speedMult;
        this.onEscape = onEscape;
        this.onDeath = onDeath;

        this.setPosition(x, y);
        this.setActive(true);
        this.setVisible(true);

        // Texture generation if needed (simple circle/rect based on type)
        // ideally we reuse textures, but for quick prototyping let's draw on existing graphics or use tint
        // Ideally we generate textures in the system or scene. 
        // For now, let's assume 'enemy' texture exists or we generate a generic one and tint it.

        // Actually, let's redraw texture based on type for visual distinction
        // Making unique textures for each is better but expensive to check every spawn.
        // Let's rely on setTexture in System or just tinting.

        // Simpler: Just resize and color
        this.setTexture('enemy');
        this.setDisplaySize(config.size, config.size);
        this.setTint(config.color);

        // Physics
        const body = this.body as Phaser.Physics.Arcade.Body;
        body.setVelocityX(-this.speed);
        body.setAllowGravity(false);
        body.setCircle(config.size / 2); // Approximation if texture is rect, but circle collider is fine
    }

    public takeDamage(amount: number) {
        if (!this.active) return;

        this.hp -= amount;
        if (this.hp <= 0) {
            // Death Effects
            const config = ENEMY_CONFIGS[this.enemyType];
            // @ts-ignore - Avoiding circular dependency for now
            if (this.scene.createExplosion) {
                // @ts-ignore
                this.scene.createExplosion(this.x, this.y, config.color);
                // @ts-ignore
                this.scene.playExplosionSound();
            }

            if (this.onDeath) this.onDeath();
            this.destroyEnemy();
        } else {
            // Flash white
            this.setTint(0xffffff);
            this.scene.time.delayedCall(100, () => {
                if (this.active) {
                    this.setTint(ENEMY_CONFIGS[this.enemyType].color);
                }
            });
        }
    }

    private destroyEnemy() {
        this.setActive(false);
        this.setVisible(false);
        if (this.body) {
            this.body.stop();
        }
    }

    preUpdate(time: number, delta: number) {
        super.preUpdate(time, delta);

        if (!this.active) return;

        // Check bounds (Left side of screen)
        if (this.x < -50) {
            if (this.onEscape) this.onEscape();
            this.destroyEnemy();
        }
    }
}
