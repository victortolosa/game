import Phaser from 'phaser';

export default class Obstacle extends Phaser.Physics.Arcade.Sprite {
    private speed: number = 50; // Match slow enemy speed or slightly faster?

    constructor(scene: Phaser.Scene, x: number, y: number) {
        super(scene, x, y, 'obstacle');

        // Add to scene and physics
        scene.add.existing(this);
        scene.physics.add.existing(this);

        // Generate texture if not exists (handled in System but good to have fallback or unique)
    }

    public spawn(x: number, y: number) {
        this.setPosition(x, y);
        this.setActive(true);
        this.setVisible(true);

        // Visuals
        this.setTexture('obstacle');
        // Thin vertical line
        this.setDisplaySize(5, 100);
        this.setTint(0x00ffff); // Cyan to distinguish

        // Physics
        const body = this.body as Phaser.Physics.Arcade.Body;
        body.setVelocityX(-this.speed);
        body.setAllowGravity(false);
        body.setImmovable(true); // Don't get pushed

        // Hitbox reinforcement
        // Visual is 5px wide, but we make body 20px wide to prevent tunneling
        // Height matches visual (100)
        body.setSize(20, 100);
        // Offset to center the hitbox on the sprite (Sprite is 0.5 anchor by default)
        // Texture width 5 -> Body 20. Diff = 15. Offset -7.5?
        // Actually setSize handles relative center if we are careful, but usually we need offset.
        // Let's rely on Phaser's center default or manual offset.
        // If w=5 and body=20. We want body to start -7.5px relative to visual left? 
        // Simpler: Just make it thicker is fine. 
        // Actually, setSize changes the W/H. offset is (width - newWidth) / 2 if we want center.
        // If texture is 5, body 20. Offset X = (5 - 20) / 2 = -7.5.
        body.setOffset((5 - 20) / 2, 0);
    }

    public destroyObstacle() {
        this.setActive(false);
        this.setVisible(false);
        if (this.body) this.body.stop();
    }

    preUpdate(time: number, delta: number) {
        super.preUpdate(time, delta);

        if (!this.active) return;

        // Check bounds (Left side of screen)
        if (this.x < -50) {
            this.destroyObstacle();
        }
    }
}
