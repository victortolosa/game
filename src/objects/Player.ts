import Phaser from 'phaser';

export default class Player extends Phaser.Physics.Arcade.Sprite {
    private targetY: number;
    private targetX: number;
    private baseX: number;
    private zoneEdgeX: number = 0;
    private isInteracting: boolean = false;
    private readonly SMOOTHING_SPEED = 10;

    // Relative Size Config
    private readonly HEIGHT_RATIO = 0.08; // Player is 8% of screen height
    private readonly WIDTH_RATIO = 0.5; // Width is 50% of height (aspect ratio)

    constructor(scene: Phaser.Scene, x: number, y: number) {
        // Start with a default size, will be resized immediately
        super(scene, x, y, 'player');

        // Generate texture if it doesn't exist (Base texture 100x200 for high enough res)
        if (!scene.textures.exists('player')) {
            const graphics = scene.make.graphics({ x: 0, y: 0 });
            graphics.fillStyle(0x00ff00, 1); // Green player
            // Draw a basic shape
            graphics.fillRect(0, 0, 100, 200);
            graphics.generateTexture('player', 100, 200);
        }
        this.setTexture('player');

        // Add to scene and physics
        scene.add.existing(this);
        scene.physics.add.existing(this);

        // Physics setup
        const body = this.body as Phaser.Physics.Arcade.Body;
        body.setCollideWorldBounds(true);
        body.setAllowGravity(false);
        body.setImmovable(true);

        this.targetY = y;
        this.baseX = x;
        this.targetX = x;

        // Initial Resize
        this.resize(scene.scale.width, scene.scale.height);
    }

    setTargetY(y: number) {
        this.targetY = y;
    }

    public setInteracting(interacting: boolean) {
        this.isInteracting = interacting;
    }

    public setZoneEdge(x: number) {
        this.zoneEdgeX = x;
    }

    public resize(_width: number, height: number) {
        // Calculate target dimensions
        const targetHeight = height * this.HEIGHT_RATIO;
        const targetWidth = targetHeight * this.WIDTH_RATIO;

        // Apply scale
        this.setDisplaySize(targetWidth, targetHeight);

        // Update physics body size to match
        // this.refreshBody(); // Updates body based on game object transform
        // Actually refreshing body might not be enough if we just want the collider to match
        const body = this.body as Phaser.Physics.Arcade.Body;
        body.setSize(targetWidth, targetHeight);
    }

    preUpdate(time: number, delta: number) {
        super.preUpdate(time, delta);

        // Calc Target X
        if (this.isInteracting) {
            // Move to edge + padding
            // We want the player to be just to the right of the split line
            // this.width is texture width, this.displayWidth is scaled width
            this.targetX = this.zoneEdgeX + (this.displayWidth / 2) + 20;
        } else {
            this.targetX = this.baseX;
        }

        // Smooth movement towards targetY
        const dy = this.targetY - this.y;
        if (Math.abs(dy) > 1) {
            this.setVelocityY(dy * this.SMOOTHING_SPEED);
        } else {
            this.setVelocityY(0);
            this.y = this.targetY;
        }

        // Smooth movement towards targetX
        const dx = this.targetX - this.x;
        // Manual position update for X since physics velocity might conflict if we want precise anim
        // But velocity is cleaner for collisions. Let's use velocity.
        if (Math.abs(dx) > 1) {
            this.setVelocityX(dx * this.SMOOTHING_SPEED);
        } else {
            this.setVelocityX(0);
            this.x = this.targetX;
        }
    }
    public setWeaponState(isReady: boolean) {
        if (isReady) {
            this.clearTint(); // Revert to original texture colors (or green if graphics)
            // If using the generated graphics texture which is green, clearTint restores it.
            // However, verify if clearTint works on generated textures.
            // If the base texture is white and we want it green, we should use setTint.
            // The constructor uses 'fillStyle(0x00ff00, 1)' so the texture itself is green.
            // clearTint() uses 0xffffff which means "no tint", showing original texture.
        } else {
            this.setTintFill(0xff0000); // Red (TintFill overrides texture color)
        }
    }

    public playRecoil() {
        // Kick back (to the left) by 20 pixels
        // The preUpdate smoothing logic will automatically spring it back to targetX
        this.x -= 20;
    }
}
