import Obstacle from './Obstacle';
import Enemy, { EnemyType } from './Enemy';

export default class EnemySystem {
    private scene: Phaser.Scene;
    private enemies: Phaser.Physics.Arcade.Group;
    private obstacles: Phaser.Physics.Arcade.Group;
    private spawnEvent?: Phaser.Time.TimerEvent;
    private escapedCount: number = 0;
    private maxEscaped: number = 5;
    private onGameOver: () => void;
    private isGameOver: boolean = false;

    // ... existing props ...

    // Config
    private spawnRate: number = 2000; // ms
    private currentSpeedMult: number = 1.0;

    // Wave State
    private remainingToSpawn: number = 0;
    private onEnemyRemoved?: () => void; // New callback for RoundManager

    constructor(scene: Phaser.Scene, onGameOver: () => void) {
        this.scene = scene;
        this.onGameOver = onGameOver;
        this.escapedCount = 0;

        // Create Groups
        this.enemies = scene.physics.add.group({
            classType: Enemy,
            runChildUpdate: true,
            maxSize: 50
        });

        this.obstacles = scene.physics.add.group({
            classType: Obstacle,
            runChildUpdate: true,
            maxSize: 20
        });

        // Generate textures
        if (!scene.textures.exists('enemy')) {
            const g = scene.make.graphics({ x: 0, y: 0 });
            g.fillStyle(0xffffff, 1);
            g.fillCircle(10, 10, 10);
            g.generateTexture('enemy', 20, 20);
        }

        if (!scene.textures.exists('obstacle')) {
            const g = scene.make.graphics({ x: 0, y: 0 });
            g.fillStyle(0x00ffff, 1);
            g.fillRect(0, 0, 5, 100);
            g.generateTexture('obstacle', 5, 100);
        }

        // Timer event will be created in startWave or setDifficulty, 
        // initially paused or just not created until wave starts
    }

    public setDifficulty(spawnDelay: number, speedMult: number) {
        this.spawnRate = spawnDelay;
        this.currentSpeedMult = speedMult;

        // If we are currently spawning, update the timer
        if (this.spawnEvent) {
            this.spawnEvent.remove();
            this.spawnEvent = this.scene.time.addEvent({
                delay: this.spawnRate,
                callback: this.spawnEntity,
                callbackScope: this,
                loop: true
            });
        }
    }

    public startWave(count: number, onEnemyRemoved: () => void) {
        this.isGameOver = false; // Reset game over state
        this.remainingToSpawn = count;
        this.onEnemyRemoved = onEnemyRemoved;

        if (this.spawnEvent) this.spawnEvent.remove();

        this.spawnEvent = this.scene.time.addEvent({
            delay: this.spawnRate,
            callback: this.spawnEntity,
            callbackScope: this,
            loop: true
        });

        console.log(`Starting Wave: ${count} enemies`);
    }

    private spawnEntity() {
        if (this.isGameOver) return;

        // Check if we have enemies left to spawn
        if (this.remainingToSpawn <= 0) {
            if (this.spawnEvent) this.spawnEvent.remove(); // Stop spawning
            return;
        }

        const { width, height } = this.scene.scale;

        // 30% chance for obstacle (does NOT consume spawn count)
        if (Math.random() < 0.3) {
            const obstacle = this.obstacles.get() as Obstacle;
            if (obstacle) {
                const padding = height * 0.15;
                const y = Phaser.Math.Between(padding, height - padding);
                const x = width + 50;
                obstacle.spawn(x, y);
            }
        } else {
            // Spawn Enemy
            const enemy = this.enemies.get() as Enemy;
            if (enemy) {
                this.remainingToSpawn--; // Decrement count

                const type = Math.random() > 0.5 ? EnemyType.SMALL : EnemyType.BIG;
                const padding = height * 0.15;
                const y = Phaser.Math.Between(padding, height - padding);
                const x = width + 50;
                // Pass callbacks
                enemy.spawn(
                    x,
                    y,
                    type,
                    () => this.handleEnemyEscape(),
                    () => this.handleEnemyDeath(),
                    this.currentSpeedMult
                );
            }
        }
    }

    private handleEnemyEscape() {
        if (this.isGameOver) return;

        this.escapedCount++;
        console.log(`Enemy Escaped! ${this.escapedCount}/${this.maxEscaped}`);

        // Notify round manager that an enemy is "removed" from play
        if (this.onEnemyRemoved) this.onEnemyRemoved();

        if (this.escapedCount >= this.maxEscaped) {
            this.triggerGameOver();
        }
    }

    private handleEnemyDeath() {
        if (this.isGameOver) return;
        // Notify round manager
        if (this.onEnemyRemoved) this.onEnemyRemoved();
    }

    private triggerGameOver() {
        this.isGameOver = true;
        if (this.spawnEvent) this.spawnEvent.remove();
        this.enemies.setVelocityX(0); // Stop all enemies
        this.onGameOver();
    }

    public getGroup(): Phaser.Physics.Arcade.Group {
        return this.enemies;
    }

    public getObstacles(): Phaser.Physics.Arcade.Group {
        return this.obstacles;
    }

    public getEscapedCount(): number {
        return this.escapedCount;
    }

    public stop() {
        this.isGameOver = true;
        if (this.spawnEvent) this.spawnEvent.remove();
        this.enemies.clear(true, true);
        this.obstacles.clear(true, true);
    }
}
