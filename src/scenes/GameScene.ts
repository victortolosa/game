import Phaser from 'phaser';
import Player from '../objects/Player';
import WeaponSystem from '../objects/WeaponSystem';
import EnemySystem from '../objects/EnemySystem';
import Enemy from '../objects/Enemy';
import ReloadMinigame from '../objects/ReloadMinigame';
import RoundManager from '../objects/RoundManager';
import SoundManager from '../utils/SoundManager';

export default class GameScene extends Phaser.Scene {
    private movePointer: Phaser.Input.Pointer | null = null;
    private aimPointer: Phaser.Input.Pointer | null = null;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private keyW!: Phaser.Input.Keyboard.Key;
    private keyS!: Phaser.Input.Keyboard.Key;
    private player!: Player;
    private weaponSystem!: WeaponSystem;
    private enemySystem!: EnemySystem;
    private roundManager!: RoundManager;
    private reloadMinigame!: ReloadMinigame;
    private weaponText!: Phaser.GameObjects.Text;
    private gameOverText!: Phaser.GameObjects.Text;
    private scoreText!: Phaser.GameObjects.Text;
    private roundText!: Phaser.GameObjects.Text;
    private startBtnContainer!: Phaser.GameObjects.Container;
    private startBtnText!: Phaser.GameObjects.Text;
    private soundManager!: SoundManager; // Add SoundManager property

    private debugText1!: Phaser.GameObjects.Text;
    private debugText2!: Phaser.GameObjects.Text;
    private splitLine!: Phaser.GameObjects.Graphics;
    private cooldownBar!: Phaser.GameObjects.Graphics;

    private gravityEvent: Phaser.Time.TimerEvent | undefined;
    private isGravityDown: boolean = true;

    constructor() {
        super('GameScene');
    }

    preload() {
        // Preload assets here
        // For now we use graphics, so no heavy assets
    }

    create() {
        // Ensure we support multi-touch
        this.input.addPointer(2); // Adds 2 extra pointers for a total of 3 (Mouse + 2 Touches)

        // Init Sound Manager
        this.soundManager = new SoundManager();

        // Init Keyboard
        if (this.input.keyboard) {
            this.cursors = this.input.keyboard.createCursorKeys();
            this.keyW = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
            this.keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
        }

        // Init Graphics
        this.splitLine = this.add.graphics();
        this.cooldownBar = this.add.graphics();

        // Gravity Flip Timer (Every 10 seconds)
        this.gravityEvent = this.time.addEvent({
            delay: 10000,
            callback: this.toggleGravity,
            callbackScope: this,
            loop: true
        });

        // Init Text Objects (Empty initially, set in layout)
        const commonStyle = { color: '#ffffff' };
        this.debugText1 = this.add.text(0, 0, 'Movement Zone', { ...commonStyle, color: '#aaaaaa' }).setOrigin(0.5);
        this.debugText2 = this.add.text(0, 0, 'Aiming Zone', { ...commonStyle, color: '#aaaaaa' }).setOrigin(0.5);
        this.weaponText = this.add.text(0, 0, 'Weapon: GRAVITY', { ...commonStyle, color: '#00ff00' }).setOrigin(0, 0);
        // this.weaponText.setInteractive(); // Disabled switch

        // Title
        this.add.text(0, 0, 'Gravity Gunner', commonStyle).setOrigin(0.5).setName('title'); // Tagging for easy retrieval if needed, or just keep it simple

        // Create Player
        this.player = new Player(this, 100, this.scale.height / 2);

        // Create Weapon System
        // Create Weapon System
        this.weaponSystem = new WeaponSystem(this, () => this.handleNeedReload());

        // Initial Layout
        this.layout();

        // Handle Resize
        this.scale.on('resize', this.resize, this);

        // Interaction for Weapon UI
        // Disabled for now
        /*
        this.weaponText.on('pointerdown', () => {
            // Hide minigame from previous weapon if active
            this.reloadMinigame.hide();

            this.weaponSystem.toggleWeapon();
            this.updateWeaponText();

            // Check if new weapon is empty
            if (this.weaponSystem.getCurrentAmmo() <= 0) {
                this.handleNeedReload();
            }
        });
        */

        // Create Reload Minigame
        this.reloadMinigame = new ReloadMinigame(this, () => this.handleReloadComplete());

        // Create Enemy System
        this.enemySystem = new EnemySystem(this, () => this.handleGameOver());

        // Collisions
        this.physics.add.overlap(
            this.weaponSystem.getProjectiles(),
            this.enemySystem.getGroup(),
            this.handleBulletHitEnemy,
            undefined,
            this
        );

        this.physics.add.collider(
            this.weaponSystem.getProjectiles(),
            this.enemySystem.getObstacles(),
            undefined,
            this.processBulletObstacleHit,
            this
        );

        // Score UI
        const scoreStyle = { fontSize: '20px', color: '#ffffff' };
        this.scoreText = this.add.text(this.scale.width / 2, 20, 'Escaped: 0/5', scoreStyle).setOrigin(0.5, 0);

        this.roundText = this.add.text(this.scale.width / 2, 50, 'Round 1 (30s)', { fontSize: '24px', color: '#ffff00', fontStyle: 'bold' }).setOrigin(0.5, 0);

        this.gameOverText = this.add.text(this.scale.width / 2, this.scale.height / 2, 'GAME OVER', {
            fontSize: '64px',
            color: '#ff0000',
            fontStyle: 'bold'
        }).setOrigin(0.5).setVisible(false).setDepth(100);

        // Start Button UI
        this.startBtnContainer = this.add.container(this.scale.width / 2, this.scale.height / 2).setVisible(false).setDepth(200);
        const btnBg = this.add.rectangle(0, 0, 300, 80, 0x00aa00).setInteractive({ useHandCursor: true });
        this.startBtnText = this.add.text(0, 0, 'START ROUND', { fontSize: '32px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
        this.startBtnContainer.add([btnBg, this.startBtnText]);

        btnBg.on('pointerdown', () => {
            this.roundManager.startNextRound();
        });

        // Round Manager
        this.roundManager = new RoundManager(this, this.enemySystem, (round, remaining, isWaiting) => {
            if (isWaiting) {
                this.roundText.setText(`ROUND ${round + 1} READY`);
                this.roundText.setColor('#00ffff');

                // Auto Reload
                this.weaponSystem.reloadAll();
                this.updateWeaponText();
                this.reloadMinigame.hide(); // Hide minigame if active

                // Show Button
                this.startBtnContainer.setVisible(true);
                this.startBtnText.setText(`START ROUND ${round + 1}`);
            } else {
                this.roundText.setText(`Round ${round} (Enemies: ${remaining})`);
                this.roundText.setColor('#ffff00');

                // Hide Button
                this.startBtnContainer.setVisible(false);
            }
        });
        this.roundManager.start();

        // Input Handling
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
            // Check if we clicked on any interactive object (buttons, UI, etc)
            if (currentlyOver && currentlyOver.length > 0) return;

            // Check UI interactions first (Legacy checks, keeping for safety or non-interactive containers)
            if (this.startBtnContainer.visible) {
                // Simple bounds check for container since it's centered
                const bounds = this.startBtnContainer.getBounds();
                if (bounds.contains(pointer.x, pointer.y)) return;
            }
            // weaponText is interactive so currentlyOver catches it, but keeping explicit check is harmless
            if (this.weaponText.getBounds().contains(pointer.x, pointer.y)) return;

            // Reload Minigame
            // If checking 'isHit' logic is needed for gaps between numbers, keep it. 
            // Better yet, if minigame is active, let's just block interaction? 
            // For now, respect the 'isHit' check which handles specific clicks.
            // Also, minigame numbers ARE interactive, so currentlyOver catches hits.
            if (this.reloadMinigame.isActive() && this.reloadMinigame.isHit(pointer)) return;

            const { width } = this.scale;
            if (pointer.x < width * 0.15) {
                // Left side: Player Movement
                if (!this.movePointer) {
                    this.movePointer = pointer;
                    this.player.setTargetY(pointer.y);
                    this.player.setInteracting(true);
                }
            } else {
                // Right side: Aiming
                if (!this.aimPointer) {
                    this.aimPointer = pointer;
                    this.weaponSystem.startAiming(pointer.x, pointer.y, this.player.x, this.player.y);
                }
            }
        });

        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (pointer === this.movePointer) {
                this.player.setTargetY(pointer.y);
            } else if (pointer === this.aimPointer) {
                this.weaponSystem.updateAiming(pointer.x, pointer.y);
            }
        });

        this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
            if (pointer === this.movePointer) {
                this.movePointer = null;
                this.player.setInteracting(false);
            } else if (pointer === this.aimPointer) {
                const fired = this.weaponSystem.fire(this.player.x, this.player.y);
                if (fired) {
                    this.player.playRecoil();
                }
                this.aimPointer = null;
                this.updateWeaponText();
            }
        });

    }

    private resize(gameSize: Phaser.Structs.Size) {
        // Resize logic called by scale manager
        // We can access new width/height via this.scale or gameSize
        const { width, height } = gameSize;

        // Resize physics world bounds if needed (usually handled automatically if properly config'd, but good to be safe)
        this.physics.world.setBounds(0, 0, width, height);

        // Update layout
        this.layout();

        // Update Player position/scale if needed
        if (this.player) {
            this.player.resize(width, height);
        }
    }

    private layout() {
        const { width, height } = this.scale;
        const shortDim = Math.min(width, height);

        // Font Sizing
        const titleSize = Math.max(24, shortDim * 0.05) + 'px';
        const labelSize = Math.max(12, shortDim * 0.03) + 'px';
        const uiSize = Math.max(14, shortDim * 0.035) + 'px';

        // Title (Finding it via children array is a bit dirty, ideally we keep ref, but for now...)
        const title = this.children.list.find(c => c.name === 'title') as Phaser.GameObjects.Text;
        if (title) {
            title.setPosition(width / 2, height / 2);
            title.setFontSize(titleSize);
        }

        // Split Line
        this.splitLine.clear();
        this.splitLine.lineStyle(2, 0xff0000);
        this.splitLine.beginPath();
        const splitX = width * 0.15;
        this.splitLine.moveTo(splitX, 0);
        this.splitLine.lineTo(splitX, height);
        this.splitLine.strokePath();

        // Update Player Zone
        if (this.player) {
            this.player.setZoneEdge(splitX);
        }

        // Zones Labels
        this.debugText1.setPosition(width * 0.075, height * 0.1).setFontSize(labelSize);
        this.debugText2.setPosition(width * 0.575, height * 0.1).setFontSize(labelSize);

        // Weapon UI
        this.weaponText.setPosition(20, 20).setFontSize(uiSize);

        // UI Updates
        if (this.scoreText) this.scoreText.setPosition(width / 2, 20).setFontSize(uiSize);
        if (this.roundText) this.roundText.setPosition(width / 2, height * 0.08).setFontSize(titleSize);
        if (this.gameOverText) this.gameOverText.setPosition(width / 2, height / 2);
        if (this.startBtnContainer) this.startBtnContainer.setPosition(width / 2, height / 2);
    }

    update(time: number, delta: number) {
        this.weaponSystem.update(time, delta, this.player.x, this.player.y);

        // Update Player Color based on Weapon State
        this.player.setWeaponState(this.weaponSystem.canFire());

        if (this.roundManager) {
            this.roundManager.update(time, delta);
        }

        // Keyboard Movement
        const speed = 600; // px/s
        let moveY = 0;

        if (this.cursors.up.isDown || this.keyW.isDown) {
            moveY = -1;
        } else if (this.cursors.down.isDown || this.keyS.isDown) {
            moveY = 1;
        }

        if (moveY !== 0) {
            const currentY = this.player.y;
            const newTarget = currentY + (moveY * speed * (delta / 1000));
            // Clamp
            const clamped = Phaser.Math.Clamp(newTarget, 50, this.scale.height - 50);
            this.player.setTargetY(clamped);
        }

        // Update Score
        if (this.enemySystem) {
            this.scoreText.setText(`Escaped: ${this.enemySystem.getEscapedCount()}/5`);
        }

        // Draw Cooldown Bar
        this.cooldownBar.clear();
        const cooldown = this.weaponSystem.getCooldownProgress();
        if (cooldown < 1) {
            const barWidth = 40;
            const barHeight = 6;
            const x = this.player.x - barWidth / 2;
            const y = this.player.y + 40; // Below player

            // Background
            this.cooldownBar.fillStyle(0x333333);
            this.cooldownBar.fillRect(x, y, barWidth, barHeight);

            // Progress
            this.cooldownBar.fillStyle(0x00ffff);
            this.cooldownBar.fillRect(x, y, barWidth * cooldown, barHeight);
        }
    }

    private handleBulletHitEnemy(projectile: any, enemy: any) {
        const p = projectile as Phaser.Physics.Arcade.Image;
        const e = enemy as Enemy;

        // Check weapon type for damage calc
        const weaponType = this.weaponSystem.getCurrentWeaponType();
        const damage = weaponType === 'GRAVITY' ? 999 : 1;

        // Only destroy linear bullets
        if (weaponType !== 'GRAVITY') {
            p.destroy();
        }

        e.takeDamage(damage);
    }

    private processBulletObstacleHit(projectile: any, _obstacle: any): boolean {
        const p = projectile as Phaser.GameObjects.GameObject;
        const type = p.getData('type');

        // Return TRUE to allow collision (physics bounce), FALSE to pass through
        return type === 'GRAVITY';
    }

    private handleGameOver() {
        this.physics.pause();
        this.gameOverText.setVisible(true);
    }

    private updateWeaponText() {
        const type = this.weaponSystem.getCurrentWeaponType();
        let text = `Weapon: ${type}`;

        if (type === 'LINEAR' || type === 'GRAVITY') {
            text += ` (${this.weaponSystem.getCurrentAmmo()}/${this.weaponSystem.getMaxAmmo()})`;
        }

        this.weaponText.setText(text);
    }

    private handleNeedReload() {
        console.log("Reload needed!");
        this.weaponText.setText("RELOAD NEEDED!");

        // Determine difficulty based on weapon
        const type = this.weaponSystem.getCurrentWeaponType();
        const count = type === 'LINEAR' ? 2 : 4;

        // Show Reload Minigame
        // Position offset to the right of the character (who is at 100)
        this.reloadMinigame.show(180, this.scale.height / 2, count);
    }

    private handleReloadComplete() {
        console.log("Reload complete!");
        this.weaponSystem.reload();
        this.updateWeaponText();
    }

    private toggleGravity() {
        this.isGravityDown = !this.isGravityDown;

        const newGravity = this.isGravityDown ? 300 : -300;
        this.physics.world.gravity.y = newGravity;

        // Visual Feedback
        if (this.isGravityDown) {
            this.cameras.main.setBackgroundColor('#000000'); // Default Dark
        } else {
            this.cameras.main.setBackgroundColor('#330000'); // Reddish Warning
        }

        console.log(`Gravity Flipped! Down: ${this.isGravityDown}`);
    }

    // Cleanup
    public shutdown() {
        if (this.gravityEvent) {
            this.gravityEvent.remove();
        }
        if (this.roundManager) {
            this.roundManager.shutdown();
        }
    }

    public createExplosion(x: number, y: number, color: number) {
        // Create particles
        const particles = this.add.particles(x, y, 'enemy', {
            speed: { min: 50, max: 200 },
            angle: { min: 0, max: 360 },
            scale: { start: 0.5, end: 0 },
            lifespan: 500,
            gravityY: 0,
            quantity: 10,
            tint: color,
            blendMode: 'ADD'
        });

        // Auto destory emitter
        this.time.delayedCall(500, () => {
            particles.destroy();
        });
    }

    public playExplosionSound() {
        this.soundManager.playExplosion();
    }
}
