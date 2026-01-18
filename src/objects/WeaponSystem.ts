import Phaser from 'phaser';

export const WeaponType = {
    GRAVITY: 'GRAVITY',
    LINEAR: 'LINEAR'
} as const;

export type WeaponType = typeof WeaponType[keyof typeof WeaponType];

export default class WeaponSystem {
    private scene: Phaser.Scene;
    private graphics: Phaser.GameObjects.Graphics;
    private projectiles: Phaser.Physics.Arcade.Group;
    private isAiming: boolean = false;
    private aimVector: Phaser.Math.Vector2;
    private currentWeapon: WeaponType = WeaponType.GRAVITY;

    // Config
    private readonly MIN_POWER = 150;
    private readonly MAX_POWER = 2200; // Increased max slightly since we ease into it
    private readonly MAX_CHARGE_TIME = 2500; // Time to reach max power (ms)
    private currentChargeDuration: number = 0;
    private currentPower: number = 0;

    // Arc Config
    private readonly MAX_ARC_OFFSET = 1200; // High aiming offset
    private readonly MIN_ARC_OFFSET = 0;    // Direct aim

    // Cooldown
    private readonly COOLDOWN = 800; // ms
    private lastFireTime: number = 0;

    // Reload / Ammo
    private readonly MAX_AMMO: Record<WeaponType, number> = {
        [WeaponType.GRAVITY]: 5,
        [WeaponType.LINEAR]: 10
    };
    private currentAmmo: Record<WeaponType, number> = {
        [WeaponType.GRAVITY]: 5,
        [WeaponType.LINEAR]: 10
    };
    private onNeedReload?: () => void;

    // Optimization: Reusable vectors to avoid allocations
    private targetPos: Phaser.Math.Vector2;
    private tempVec1: Phaser.Math.Vector2;
    private tempVec2: Phaser.Math.Vector2;

    constructor(scene: Phaser.Scene, onNeedReload?: () => void) {
        this.scene = scene;
        this.onNeedReload = onNeedReload;
        this.graphics = scene.add.graphics();
        this.projectiles = scene.physics.add.group();
        this.aimVector = new Phaser.Math.Vector2();

        // Init temp vectors
        this.targetPos = new Phaser.Math.Vector2();
        this.tempVec1 = new Phaser.Math.Vector2();
        this.tempVec2 = new Phaser.Math.Vector2();

        // Generate projectile texture
        if (!scene.textures.exists('projectile')) {
            const g = scene.make.graphics({ x: 0, y: 0 });
            g.fillStyle(0xffaa00, 1);
            g.fillCircle(5, 5, 5);
            g.generateTexture('projectile', 10, 10);
        }
    }

    public getProjectiles(): Phaser.Physics.Arcade.Group {
        return this.projectiles;
    }

    public update(_time: number, delta: number, playerX: number, playerY: number) {
        if (this.isAiming) {
            // Charge power (Exponential / Quadratic Ease-In)
            this.currentChargeDuration += delta;
            if (this.currentChargeDuration > this.MAX_CHARGE_TIME) {
                this.currentChargeDuration = this.MAX_CHARGE_TIME;
            }

            const t = this.currentChargeDuration / this.MAX_CHARGE_TIME; // 0.0 to 1.0
            const ease = t * t; // Quadratic Ease In (Starts slow, speeds up)

            this.currentPower = this.MIN_POWER + (this.MAX_POWER - this.MIN_POWER) * ease;

            // Continuously update aim direction based on latest player position
            this.updateAimDirection(this.targetPos.x, this.targetPos.y, playerX, playerY);

            // Redraw trajectory
            this.drawTrajectory(playerX, playerY);
        }

        // Cleanup projectiles that have left the screen
        const { width, height } = this.scene.scale;
        this.projectiles.children.each((entry) => {
            const projectile = entry as Phaser.Physics.Arcade.Image;
            const margin = 50;
            if (projectile.x < -margin || projectile.x > width + margin ||
                projectile.y < -margin || projectile.y > height + margin) {
                projectile.destroy();
            }
            return true; // continue iteration
        });
    }

    public toggleWeapon() {
        // Disabled
        /*
        this.currentWeapon = this.currentWeapon === WeaponType.GRAVITY
            ? WeaponType.LINEAR
            : WeaponType.GRAVITY;
        console.log(`Weapon switched to: ${this.currentWeapon}`);
        */
    }

    public getCurrentWeaponType(): string {
        return this.currentWeapon;
    }

    public getCurrentAmmo(): number {
        return this.currentAmmo[this.currentWeapon];
    }

    public getMaxAmmo(): number {
        return this.MAX_AMMO[this.currentWeapon];
    }

    public reload() {
        this.currentAmmo[this.currentWeapon] = this.MAX_AMMO[this.currentWeapon];
    }

    public reloadAll() {
        this.currentAmmo[WeaponType.GRAVITY] = this.MAX_AMMO[WeaponType.GRAVITY];
        this.currentAmmo[WeaponType.LINEAR] = this.MAX_AMMO[WeaponType.LINEAR];
    }

    // Input Handling
    public startAiming(x: number, y: number, originX: number, originY: number) {
        // Check Ammo for current weapon
        if (this.currentAmmo[this.currentWeapon] <= 0) {
            if (this.onNeedReload) this.onNeedReload();
            return;
        }

        this.isAiming = true;
        this.currentChargeDuration = 0;
        this.currentPower = this.MIN_POWER;
        this.targetPos.set(x, y);
        this.updateAimDirection(x, y, originX, originY);
    }

    public updateAiming(x: number, y: number) {
        if (!this.isAiming) return;
        this.targetPos.set(x, y);
        // Direction and trajectory now updated in main update loop
    }

    private updateAimDirection(targetX: number, targetY: number, originX: number, originY: number) {
        // Calculate direction from player to target

        // Bow and Arrow Logic:
        // If Gravity Gun, aim slightly higher than the cursor to compensate for drop
        let aimTargetY = targetY;
        if (this.currentWeapon === WeaponType.GRAVITY) {
            // Calculate interpolation factor (0.0 to 1.0)
            const powerRatio = (this.currentPower - this.MIN_POWER) / (this.MAX_POWER - this.MIN_POWER);

            // Linear Interpolation: High Offset -> Low Offset
            const currentOffset = Phaser.Math.Linear(this.MAX_ARC_OFFSET, this.MIN_ARC_OFFSET, powerRatio);

            // Apply upward offset (negative Y)
            aimTargetY -= currentOffset;
        }

        // Use tempVec1 to avoid allocation
        this.tempVec1.set(targetX - originX, aimTargetY - originY);
        this.tempVec1.normalize();
        this.aimVector.copy(this.tempVec1);
    }

    public fire(originX: number, originY: number): boolean {
        if (!this.isAiming) return false;

        // Check Cooldown
        const now = this.scene.time.now;
        if (now - this.lastFireTime < this.COOLDOWN) {
            this.isAiming = false;
            this.graphics.clear();
            return false;
        }

        // Check Ammo again (just in case) and decrement
        if (this.currentAmmo[this.currentWeapon] <= 0) {
            this.isAiming = false;
            this.graphics.clear();
            if (this.onNeedReload) this.onNeedReload();
            return false;
        }

        // Decrement Ammo
        this.currentAmmo[this.currentWeapon]--;

        this.isAiming = false;
        this.graphics.clear();

        // Update last fire time
        this.lastFireTime = this.scene.time.now;

        // Final Velocity Vector
        const finalVelocity = this.aimVector.clone().scale(this.currentPower);

        // Spawn Projectile
        const projectile = this.projectiles.create(originX, originY, 'projectile') as Phaser.Physics.Arcade.Image;
        projectile.setVelocity(finalVelocity.x, finalVelocity.y);
        projectile.setData('type', this.currentWeapon); // Store type for collision logic

        if (this.currentWeapon === WeaponType.GRAVITY) {
            // Check direction of world gravity
            const worldG = this.scene.physics.world.gravity.y;
            const isDown = worldG >= 0;

            // If down, add positive gravity. If up, add negative gravity (fall up faster)
            // Balanced gravity for progressive range
            const extraG = 600;
            const addedG = isDown ? extraG : -extraG;

            projectile.setGravityY(addedG);
            projectile.setBounce(0.6);
        } else {
            // Linear: No Gravity
            (projectile.body as Phaser.Physics.Arcade.Body).allowGravity = false;
        }

        return true;
    }

    private drawTrajectory(originX: number, originY: number) {
        this.graphics.clear();

        const isGravityWeapon = this.currentWeapon === WeaponType.GRAVITY;

        // Visual indicator for power (thickness)
        const powerRatio = (this.currentPower - this.MIN_POWER) / (this.MAX_POWER - this.MIN_POWER);
        const thickness = 2 + (2 * powerRatio); // 2 to 4px thickness

        // Sim physics
        let simX = originX;
        let simY = originY;

        // Use tempVec2 for velocity calculation to avoid allocation
        this.tempVec2.copy(this.aimVector).scale(this.currentPower);
        let velX = this.tempVec2.x;
        let velY = this.tempVec2.y;

        // Sim Params
        const steps = 20;
        const timeStep = 0.008;

        // Standard Gravity Sim Vars
        // Standard Gravity Sim Vars
        const worldGravity = this.scene.physics.world.gravity.y || 300;
        const isDown = worldGravity >= 0;
        const extraG = 600; // Must match fire() logic
        const addedGravity = isDown ? extraG : -extraG;
        const totalGravity = worldGravity + addedGravity;

        // Linear: Single Path
        if (!isGravityWeapon) {
            this.graphics.lineStyle(thickness, 0xffffff, 0.8);
            this.graphics.beginPath();
            this.graphics.moveTo(simX, simY);

            // Draw straight line end point (simulate 1 sec)
            const endX = simX + (velX * 0.9);
            const endY = simY + (velY * 0.9);
            this.graphics.lineTo(endX, endY);
            this.graphics.strokePath();
            return;
        }

        // Gravity Weapon Sim Loop
        for (let i = 0; i < steps; i++) {
            const prevX = simX;
            const prevY = simY;

            // Apply Velocity
            simX += velX * timeStep;
            simY += velY * timeStep;

            // Apply Gravity to Velocity
            velY += totalGravity * timeStep;

            // Draw Segment with fading alpha
            const alpha = 1 - (i / steps);
            this.graphics.lineStyle(thickness, 0xffffff, alpha);
            this.graphics.beginPath();
            this.graphics.moveTo(prevX, prevY);
            this.graphics.lineTo(simX, simY);
            this.graphics.strokePath();
        }
    }

    public canFire(): boolean {
        const now = this.scene.time.now;
        const isCooldownReady = (now - this.lastFireTime >= this.COOLDOWN);
        const hasAmmo = this.currentAmmo[this.currentWeapon] > 0;
        return isCooldownReady && hasAmmo;
    }
    public getCooldownProgress(): number {
        const now = this.scene.time.now;
        const timeSinceFire = now - this.lastFireTime;
        return Phaser.Math.Clamp(timeSinceFire / this.COOLDOWN, 0, 1);
    }
}
