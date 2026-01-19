import Phaser from 'phaser';
import { GameConfig } from '../GameConfig';
import { Boss } from '../entities/Boss';
import { PhaseManager } from '../systems/PhaseManager';

export default class MainScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainScene' });
    }

    create(data) {
        this.isDebug = data && data.debugMode ? true : false;

        // Apply Config
        if (this.isDebug && data.config) {
            this.debugInvincible = data.config.godMode;
            this.forceBossStart = data.config.startBoss;
            this.forceChallengeStart = data.config.challenge;
            if (!data.config.startFullAmmo) this.currentAmmo = 0;
        } else {
            // Defaults
            this.debugInvincible = false;
        }
        // --- Constants ---
        this.width = this.scale.width;
        this.height = this.scale.height;
        this.wallThickness = 40; // Reduced to 40
        this.chunkHeight = this.height * 2; // Each chunk is 2 screens tall
        this.totalChunks = 3; // Keep 3 chunks active (Previous, Current, Next)
        this.scrollSpeed = 4.5; // Set to 4.5 explicitly

        // --- State ---
        this.wallChunks = []; // Array of { left, right, obstacles: [], y }
        this.playerMaxHealth = 100;
        this.playerHealth = this.playerMaxHealth;
        this.distance = 0; // Initialize distance
        this.enemiesKilled = 0;
        this.currentWeapon = 'NORMAL';
        this.weaponLevels = { SHOTGUN: 0, HOMING: 0 }; // Track levels
        this.passiveLevels = { REDWALL_HURT_LESS: 0, YELLOW_OBSTACLE_HEAL: 0 }; // Track passive levels
        this.totalUpgradesCount = 0; // Total upgrades acquired
        this.currentKillProgress = 0; // Kill progress for CURRENT tier
        this.currentAmmo = GameConfig.Ammo.Max; // Initialize Full Ammo
        this.slowMoFactor = 1.0;
        this.virtualTime = 0;
        this.isGameOver = false;

        // --- Phase Management ---
        this.phaseManager = new PhaseManager(this);

        this.targetWallThickness = 40;
        this.currentWallThickness = 40;
        this.leftWallThickness = 40;
        this.rightWallThickness = 40;
        this.pathOffset = 0; // -1 to 1 shift
        this.chunkCount = 0;

        // --- Flying Enemies ---
        this.flyingEnemies = [];
        this.flyingEnemyConfig = {
            width: 30,
            height: 30,
            shieldRadius: 22,
            speed: 2,
            shootInterval: 10000, // Base interval 10s
            spawnChance: 0.7 // Increased for continuous feel
        };

        this.tankEnemyConfig = {
            width: 40, // Slightly larger
            height: 40,
            shieldRadius: 35,
            speed: 1, // Slower
            shootInterval: 15000, // Burst fire interval 15s
            hp: 10,
            shieldHits: 3,
            spawnChance: 0.3 // Rare
        };

        // --- Projectile Tracking ---
        this.allProjectiles = [];

        // --- Enemy Spawn Timer ---
        this.enemySpawnTimer = 0; // Initialize

        // --- DEBUG: Boss Start Override ---
        if (this.forceBossStart) {
            console.log('DEBUG: Forcing Boss Start');
            // 1. Disable regular enemies
            this.flyingEnemyConfig.spawnChance = 0;
            this.tankEnemyConfig.spawnChance = 0;

            // 2. Direct jump to BOSS mode
            this.phaseManager.forcePhase('BOSS');

            // 3. Ensure no enemies exist initially
            this.flyingEnemies = [];
        }

        // --- Visual Effects ---
        this.boss = new Boss(this);
        this.attachedSmokes = [];

        // --- Walls Setup ---
        // Initialize chunks starting from y=0
        for (let i = 0; i < this.totalChunks; i++) {
            this.createWallChunk(i * this.chunkHeight);
        }

        this.createAirShotEffect = (angle) => {
            // "Muzzle Flash" / "Air Puff" - Directional & Larger
            const count = 10;
            const spread = 0.5; // Spread cone in radians

            for (let i = 0; i < count; i++) {
                // Directional offset
                const particleAngle = angle + Phaser.Math.FloatBetween(-spread, spread);
                const speed = Phaser.Math.FloatBetween(20, 60); // Distance to travel outward instantly? No, just offset.
                const dist = Phaser.Math.FloatBetween(10, 50); // Muzzle length

                const offsetX = Math.cos(particleAngle) * dist;
                const offsetY = Math.sin(particleAngle) * dist;

                const smoke = this.add.image(this.player.x + offsetX * 0.2, this.player.y + offsetY * 0.2, 'smoke');
                smoke.setDepth(200);
                smoke.setScale(Phaser.Math.FloatBetween(1.0, 2.5)); // Much Bigger
                smoke.setAlpha(0.9);
                smoke.setTint(0xffffff); // Ensure white

                // Store offset for "Fixed Relation" logic in update
                // Animate the offset expanding outward to give "puff" feel while staying attached
                smoke.relativeX = offsetX * 0.2;
                smoke.relativeY = offsetY * 0.2;
                smoke.targetRelativeX = offsetX;
                smoke.targetRelativeY = offsetY;

                // Expand and Fade
                this.tweens.add({
                    targets: smoke,
                    scale: 0, // Shrink out or expand out? Let's Fade out only? Or expand?
                    // Let's expand scale and fade out
                    scale: 3.0,
                    alpha: 0,
                    duration: 300,
                    ease: 'Quad.out',
                    onUpdate: (tween) => {
                        // Interpolate relative positions to "move" outward while attached
                        const p = tween.progress;
                        if (smoke.active) {
                            smoke.relativeX = Phaser.Math.Interpolation.Linear([offsetX * 0.2, offsetX], p);
                            smoke.relativeY = Phaser.Math.Interpolation.Linear([offsetY * 0.2, offsetY], p);
                        }
                    },
                    onComplete: () => {
                        smoke.destroy();
                        const idx = this.attachedSmokes.indexOf(smoke);
                        if (idx > -1) this.attachedSmokes.splice(idx, 1);
                    }
                });

                this.attachedSmokes.push(smoke);
            }
        }

        // --- Player ---

        // --- Player ---
        // --- Player ---
        this.playerSize = { w: 24, h: 36 }; // Reduced by 40% (40->24, 60->36)

        // Adjust Physics for "Floaty" feel
        this.matter.world.setGravity(0, 1.15); // Increased gravity (~1.15)

        // Random Start Position
        const startSide = Math.random() > 0.5 ? 'left' : 'right';
        // Calculate X to be touching the wall (approx)
        // Wall extends 0 -> wallThickness (Left) or width-wallThickness -> width (Right)
        // Player origin is center.
        const startX = startSide === 'left'
            ? this.wallThickness + this.playerSize.w / 2 + 1
            : this.width - this.wallThickness - this.playerSize.w / 2 - 1;

        this.player = this.matter.add.image(startX, 200, null, null, {
            label: 'player',
            frictionAir: 0,
            friction: 0,
            shape: {
                type: 'rectangle',
                width: this.playerSize.w,
                height: this.playerSize.h,
                chamfer: { radius: 6 } // Reduced radius
            },
            render: { visible: false } // Hide the physics body default sprite
        });

        // Push slightly into the wall to ensure collision trigger
        this.player.applyForce({ x: startSide === 'left' ? -0.01 : 0.01, y: 0 });

        // Player visual (Separate Sprite)
        // --- Player Visuals Generation ---
        const pixelSize = 2;
        const P = {
            '.': null, 'X': 0x222222, 'D': 0x666666, 'G': 0xaaaaaa, 'L': 0xeeeeee,
            'd': 0x444444 // Darker for Gun
        };

        const createTex = (key, frame) => {
            if (this.textures.exists(key)) return;
            const g = this.make.graphics();
            frame.forEach((row, y) => {
                for (let x = 0; x < row.length; x++) {
                    const char = row[x];
                    if (P[char] !== undefined && P[char] !== null) {
                        g.fillStyle(P[char]);
                        g.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
                    }
                }
            });
            g.generateTexture(key, this.playerSize.w, this.playerSize.h);
            g.destroy();
        };

        // 1. Idle
        createTex('playerIdle', [
            "....XXXX....", "...XDDDDX...", "..XDDDDDDX..", "..XLLLLLLX..", ".XLLXLLXLLX.", ".XLLLLLLLLX.",
            "..XLLLLLLX..", "...XXXXXX...", "..XDGGGGDX..", ".XDDGGGGDDX.", ".XDGGGGGGDX.", ".XDDGGGGDDX.",
            "..XDDDDDDX..", "..XDDDDDDX..", "..XD.DD.DX..", "..XD.DD.DX..", "..XX.XX.XX..", "..XX....XX.."
        ]);

        // 2. Slide Left (Left Arm Up)
        createTex('playerSlideLeft', [
            "....XXXX....", "...XDDDDX...", ".XXDDDDDDX..", "XDXLLLLLLX..", "XDXLLXLLXLL.", "XDXLLLLLLLL.",
            "XDXLLLLLLX..", ".X.XXXXXX...", ".XD.GGGGDX..", ".X.DGGGGDDX.", "...GGGGGGDX.", "...GGGGGDDX.",
            "..XDDDDDDX..", "..XDDDDDDX..", "..XD.DD.DX..", "..XD.DD.DX..", "..XX.XX.XX..", "..XX....XX.."
        ]);

        // 3. Slide Right (Right Arm Up)
        createTex('playerSlideRight', [
            "....XXXX....", "...XDDDDX...", "..XDDDDDDXX.", "..XLLLLLLXDX", ".LLXLLXLLXDX", ".LLLLLLLLXDX",
            "..XLLLLLLXDX", "...XXXXXX.X.", "..XDGGGG.DX.", ".XDDGGGGD.X.", ".XDGGGGGG...", ".XDDGGGGG...",
            "..XDDDDDDX..", "..XDDDDDDX..", "..XD.DD.DX..", "..XD.DD.DX..", "..XX.XX.XX..", "..XX....XX.."
        ]);

        // 4. Shoot (Gun in Right Hand)
        createTex('playerShoot', [
            "....XXXX....", "...XDDDDX...", "..XDDDDDDX..", "..XLLLLLLX..", ".XLLXLLXLLX.", ".XLLLLLLLLX.",
            "..XLLLLLLX..", "...XXXXXX...", "..XDGGGGDX..", ".XDDGGGGDDX.", ".XDGGGGGGDX.", ".XDDGGGGDDX.",
            "..XDDDDDDX..", "..XDDDDDDX..", "..XD.DD.DX..", "..XD.DD.DX..", "..XX.XX.XX..", "..XX....XX.."
            // Ideally change the arm, but for now this is a placeholder 'Action' frame if we want subtle diff
        ]);
        // Let's make the Shoot frame actually look different.
        // Gun in Right hand (Script overwrite)
        const shootFrame = [
            "....XXXX....", "...XDDDDX...", "..XDDDDDDX..", "..XLLLLLLX..", ".XLLXLLXLLX.", ".XLLLLLLLLX.",
            "..XLLLLLLX..", "...XXXXXX...", "..XDGGGGDX..", ".XDDGGGGDDX.", ".XDGGGGGGDd.", ".XDDGGGGDDd.", // 'd' is gun tip
            "..XDDDDDDXd.", "..XDDDDDDXd.", "..XD.DD.DX..", "..XD.DD.DX..", "..XX.XX.XX..", "..XX....XX.."
        ];
        // Re-generate 'playerShoot' properly
        this.textures.remove('playerShoot');
        createTex('playerShoot', shootFrame);


        this.playerVisual = this.add.image(this.player.x, this.player.y, 'playerIdle');
        this.isShooting = false;

        // --- Camera ---
        this.cameras.main.setBackgroundColor('#000000');
        // Center camera X, but Y starts at 0 (top-left is 0,0 usually). 
        // We want camera to scroll down.



        // --- UI ---
        // Health Bar (Top Left)
        this.add.text(20, 20, 'HP', { fontSize: '15px', fill: '#ffffff', fontFamily: GameConfig.UI.FontFamily }).setScrollFactor(0).setDepth(100);
        this.healthBarBg = this.add.rectangle(55, 30, 100, 20, 0x333333).setOrigin(0, 0.5).setScrollFactor(0).setDepth(100);
        this.healthBarFill = this.add.rectangle(55, 30, 100, 16, 0x00ff00).setOrigin(0, 0.5).setScrollFactor(0).setDepth(101);

        // Distance Meter (Top Right)
        this.distanceText = this.add.text(this.width - 20, 20, '0m', {
            fontSize: '27px',
            fill: '#ffffff',
            fontFamily: GameConfig.UI.FontFamily
        }).setOrigin(1, 0).setScrollFactor(0).setDepth(100);

        // --- Input ---
        this.input.on('pointerdown', this.handleJump, this);

        // --- Collision Events ---
        this.matter.world.on('collisionstart', this.handleCollisionStart, this);
        this.matter.world.on('collisionend', this.handleCollisionEnd, this);

        this.touchingWallCount = 0;

        // --- Particles ---
        const particleGraphics = this.make.graphics().fillStyle(0xffffff, 0.5).fillCircle(5, 5, 5);
        particleGraphics.generateTexture('dust', 10, 10);

        this.dustEmitter = this.add.particles(0, 0, 'dust', {
            lifespan: 300,
            speed: { min: 50, max: 150 },
            angle: { min: 250, max: 290 }, // Upwards
            scale: { start: 1, end: 0 },
            alpha: { start: 0.6, end: 0 },
            gravityY: 200,
            frequency: 40,
            emitting: false
        });

        // --- Camera ---
        // --- Missile Trail Particles ---
        const trailGraphics = this.make.graphics().fillStyle(0xffff00, 0.5).fillCircle(5, 5, 3);
        trailGraphics.generateTexture('trail', 6, 6);
        this.missileTrailEmitter = this.add.particles(0, 0, 'trail', {
            lifespan: 200,
            scale: { start: 1, end: 0 },
            alpha: { start: 0.5, end: 0 },
            frequency: -1, // Manual emit
            blendMode: 'ADD'
        });

        // Initialize Pause Button
        this.createPauseButton();
        this.createAmmoUI();

        // --- Smoke Texture for Air Shots ---
        const smokeGraphics = this.make.graphics().fillStyle(0xffffff, 0.8).fillCircle(4, 4, 4);
        smokeGraphics.generateTexture('smoke', 8, 8);
        smokeGraphics.destroy();

        // Initialize Debug UI and Modal (Moved to end of create to ensure readiness)
        // Initialize Debug UI
        if (this.isDebug) {
            this.createDebugUI();

            // Apply Logic Hooks based on Config
            if (this.forceBossStart) {
                this.phaseManager.nextBossThreshold = 0;
            }
            if (this.forceChallengeStart) {
                this.phaseManager.forcePhase('CHALLENGE', 'GATES');
            }
            if (this.debugInvincible) {
                // Visual update handled in createDebugUI or update?
                this.playerVisual.setAlpha(0.5);
            }
        }
    }

    createAmmoUI() {
        this.ammoText = this.add.text(20, 100, `AMMO: ${this.currentAmmo}/${GameConfig.Ammo.Max}`, {
            fontSize: '20px', // Reduced from 24
            fill: '#00ffff',
            fontFamily: GameConfig.UI.FontFamily,
            stroke: '#000000',
            strokeThickness: 3
        }).setScrollFactor(0).setDepth(2000);
    }

    updateAmmoUI() {
        if (this.ammoText) {
            this.ammoText.setText(`AMMO: ${this.currentAmmo}/${GameConfig.Ammo.Max}`);

            if (this.currentAmmo <= 0) {
                this.ammoText.setColor('#ff0000'); // Red when empty
            } else {
                this.ammoText.setColor('#00ffff'); // Cyan normally
            }
        }
    }

    handleJump(pointer) {
        if (this.isGameOver) return;

        if (this.touchingWallCount > 0) {
            const onLeft = this.player.x < this.width / 2;
            // Jump to opposite side
            // Reduced forces to account for smaller mass (24x36 vs 40x60)
            const forceX = onLeft ? 0.02 : -0.02; // Was 0.05
            const forceY = -0.01; // Was -0.025. Slight pop up to arc

            this.player.applyForce({ x: forceX, y: forceY });
        } else {
            // Not on wall -> Shoot at tap location
            this.shootProjectile(pointer);
        }
    }

    shootProjectile(pointer) {
        // Base Direction Calculation
        let baseAngle = Math.PI / 2; // Default Down
        if (pointer) {
            const vectorX = pointer.worldX - this.player.x;
            const vectorY = pointer.worldY - this.player.y;
            // Standardize length check to avoid NaN
            if (vectorX !== 0 || vectorY !== 0) {
                baseAngle = Math.atan2(vectorY, vectorX);
            }
        }

        let recoilVx = 0;
        let recoilVy = 0;

        if (this.currentAmmo > 0) {
            // --- FIRE BULLETS ---

            // Helper to create bullet
            const createBullet = (angle, isHoming = false) => {
                const projectile = this.createPhysicsRect(this.player.x, this.player.y, 10, 20, 0x00ffff, 'projectile', true, { ignoreGravity: true });

                // Homing Config or Current Weapon Config
                const config = isHoming ? GameConfig.Weapons.HOMING : GameConfig.Weapons[this.currentWeapon];
                const speed = config.speed || 25;
                const damage = config.damage || 1;

                const vx = Math.cos(angle) * speed;
                const vy = Math.sin(angle) * speed;
                projectile.setVelocity(vx, vy);
                projectile.setRotation(angle - Math.PI / 2);
                this.allProjectiles.push(projectile);

                projectile.setData('damage', damage);

                if (isHoming) {
                    projectile.setData('isHoming', true);
                    projectile.setAlpha(1); // Opaque
                    projectile.fillColor = 0xffff00; // Yellow
                }

                return { vx, vy, projectile };
            };

            // --- 1. Fire Main Weapon ---
            const mainConfig = GameConfig.Weapons[this.currentWeapon];
            let mainBullets = mainConfig.bullets || 1;

            if (this.currentWeapon === 'SHOTGUN') {
                const level = this.weaponLevels.SHOTGUN || 1;
                mainBullets = mainConfig.baseBullets + (level - 1) * mainConfig.bulletsPerLevel;
            } else {
                // Normal
                mainBullets = 1;
            }

            if (mainBullets > 1) {
                const spreadTotal = mainConfig.spreadAngle || 0.2;
                const step = mainBullets > 1 ? spreadTotal / (mainBullets - 1) : 0;
                const startOffset = -spreadTotal / 2;

                for (let i = 0; i < mainBullets; i++) {
                    const offset = startOffset + (i * step);
                    createBullet(baseAngle + offset, false);
                }
                recoilVx = Math.cos(baseAngle) * 25;
                recoilVy = Math.sin(baseAngle) * 25;
            } else {
                const result = createBullet(baseAngle, false);
                recoilVx = result.vx;
                recoilVy = result.vy;
            }

            // --- 2. Fire Secondary (Homing) ---
            // 25% Chance to fire homing missiles
            if (Math.random() < 0.25) {
                const homingLevel = this.weaponLevels.HOMING || 0;
                if (homingLevel > 0) {
                    const homingConfig = GameConfig.Weapons.HOMING;
                    const homingCount = homingConfig.baseBullets + (homingLevel - 1) * homingConfig.bulletsPerLevel;

                    // Spread homing missiles slightly if multiple
                    const spreadTotal = 0.5;
                    const step = homingCount > 1 ? spreadTotal / (homingCount - 1) : 0;
                    const startOffset = homingCount > 1 ? -spreadTotal / 2 : 0;

                    for (let i = 0; i < homingCount; i++) {
                        const offset = startOffset + (i * step);
                        createBullet(baseAngle + offset, true);
                    }
                }
            }

            // Decrement Ammo
            this.currentAmmo--;
            this.updateAmmoUI();

        } else {
            // --- AIR SHOT (Empty Ammo) ---
            this.createAirShotEffect(baseAngle);

            // Calculate Recoil (Same strength as shooting)
            recoilVx = Math.cos(baseAngle) * 25;
            recoilVy = Math.sin(baseAngle) * 25;

            this.updateAmmoUI();
        }

        // --- Recoil (Applied for both Bullet and Air Shot) ---
        const currentVel = this.player.body.velocity;
        this.player.setVelocity(currentVel.x * 0.5, currentVel.y * 0.5);

        const recoilStrength = 0.008;
        const recoilXMultiplier = 2.5;
        const recoilX = -(recoilVx / 25) * recoilStrength * recoilXMultiplier;
        const recoilY = -(recoilVy / 25) * recoilStrength;

        // Boost Y recoil slightly to help stay airborne
        this.player.applyForce({ x: recoilX, y: recoilY - 0.005 });

        // 3. Shove away from current horizontal trajectory slightly
        const nudgeStrength = 0.003;
        const nudgeX = currentVel.x > 0 ? -nudgeStrength : nudgeStrength;
        this.player.applyForce({ x: nudgeX, y: 0 });

        // Trigger Shooting Visual
        this.isShooting = true;
        if (this.shootResetEvent) this.shootResetEvent.remove();
        this.shootResetEvent = this.time.delayedCall(250, () => {
            this.isShooting = false;
        });
    }


    createPhysicsRect(x, y, w, h, color, label, isSensor = false, options = {}) {
        const rect = this.add.rectangle(x, y, w, h, color);
        this.matter.add.gameObject(rect, {
            isStatic: !isSensor,
            label: label,
            isSensor: isSensor,
            shape: { type: 'rectangle', width: w, height: h },
            ...options
        });
        return rect;
    }

    createWallChunk(yPos, recycledChunk = null) {
        const centerY = yPos + this.chunkHeight / 2;

        // --- Wall Texture Generation ---
        if (!this.textures.exists('wallTexture')) {
            const size = 32;
            const canvas = this.textures.createCanvas('wallTexture', size, size);
            const ctx = canvas.context;

            // Base: Black/Very Dark Grey
            ctx.fillStyle = '#111111';
            ctx.fillRect(0, 0, size, size);

            // Add Rubble/Dirt Noise
            // Draw random "bricks" or "clumps"
            for (let i = 0; i < 20; i++) {
                const x = Math.floor(Math.random() * size);
                const y = Math.floor(Math.random() * size);
                const w = 2 + Math.floor(Math.random() * 4);
                const h = 2 + Math.floor(Math.random() * 4);

                // Grayscale shades
                const shades = ['#444444', '#777777', '#999999', '#bbbbbb'];
                ctx.fillStyle = shades[Math.floor(Math.random() * shades.length)];

                ctx.fillRect(x, y, w, h);
            }
            // Pixelate effect cleanup (optional, but 32x32 is already low res)
            canvas.refresh();
        }

        // --- Spike Wall Texture Generation ---
        if (!this.textures.exists('spikeWallTexture')) {
            const size = 32;
            const canvas = this.textures.createCanvas('spikeWallTexture', size, size);
            const ctx = canvas.context;

            // Base: Dark Red
            ctx.fillStyle = '#440000';
            ctx.fillRect(0, 0, size, size);

            // Add Spikes (Triangles)
            ctx.fillStyle = '#ff0000';
            for (let i = 0; i < 4; i++) {
                // Draw a spike
                ctx.beginPath();
                ctx.moveTo(0, i * 8);
                ctx.lineTo(8, i * 8 + 4);
                ctx.lineTo(0, i * 8 + 8);
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(32, i * 8);
                ctx.lineTo(24, i * 8 + 4);
                ctx.lineTo(32, i * 8 + 8);
                ctx.fill();
            }
            canvas.refresh();
        }

        // --- Boss Wall Texture Generation ---
        if (!this.textures.exists('bossWallTexture')) {
            const size = 32;
            const canvas = this.textures.createCanvas('bossWallTexture', size, size);
            const ctx = canvas.context;

            // 1. Base: Black/Very Dark Grey (Same as Wall)
            ctx.fillStyle = '#111111';
            ctx.fillRect(0, 0, size, size);

            // 2. Add Rubble/Dirt Noise (Same as Wall)
            for (let i = 0; i < 20; i++) {
                const x = Math.floor(Math.random() * size);
                const y = Math.floor(Math.random() * size);
                const w = 2 + Math.floor(Math.random() * 4);
                const h = 2 + Math.floor(Math.random() * 4);

                // Grayscale shades
                const shades = ['#444444', '#777777', '#999999', '#bbbbbb'];
                ctx.fillStyle = shades[Math.floor(Math.random() * shades.length)];
                ctx.fillRect(x, y, w, h);
            }

            // 3. Red Glow Overlay
            ctx.fillStyle = 'rgba(255, 0, 0, 0.4)'; // Red with opacity
            ctx.fillRect(0, 0, size, size);

            // 4. Optional: Red Border for "Pop"
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 1;
            ctx.strokeRect(0, 0, size, size);

            canvas.refresh();
        }



        // Update Zone Logic via Phase Manager
        this.phaseManager.update(this.distance, this.flyingEnemies.length);
        this.phaseManager.incrementChunk();
        this.chunkCount++;

        // Get Current Phase Config
        let phaseConfig = this.phaseManager.getCurrentConfig();

        // --- Spawn Boss? ---
        if (this.phaseManager.pendingBossSpawn && phaseConfig.bossWallActive) {
            this.spawnBoss(yPos + this.chunkHeight / 2); // Center of this new chunk
            this.phaseManager.pendingBossSpawn = false;
        }

        // --- Winding & Thickness Logic ---
        let baseGap = phaseConfig.baseGap;

        if (phaseConfig.pathWinding) {
            // Zig-Zag Oscillation
            this.pathOffset = Math.sin(this.chunkCount * 0.8) * 120;
        } else {
            this.pathOffset = 0;
        }

        // Calculate Target Thicknesses to center the Gap at PathOffset
        // width = left + gap + right
        // center of gap is (left + gap/2)
        // we want center of gap to be (width/2 + pathOffset)
        // left = width/2 + pathOffset - gap/2
        const targetLeft = Math.max(this.wallThickness, (this.width / 2) + this.pathOffset - (baseGap / 2));
        const targetRight = Math.max(this.wallThickness, (this.width / 2) - this.pathOffset - (baseGap / 2));

        // Smoothly adjust (Lerp-ish)
        const transitionSpeed = 30;
        if (Math.abs(this.leftWallThickness - targetLeft) > transitionSpeed) {
            this.leftWallThickness += (targetLeft > this.leftWallThickness ? transitionSpeed : -transitionSpeed);
        } else {
            this.leftWallThickness = targetLeft;
        }

        if (Math.abs(this.rightWallThickness - targetRight) > transitionSpeed) {
            this.rightWallThickness += (targetRight > this.rightWallThickness ? transitionSpeed : -transitionSpeed);
        } else {
            this.rightWallThickness = targetRight;
        }

        // UpdateOrCreateWall needs to know which texture and label to use per wall
        const updateOrCreateWall = (side, x, y, w, h, label, texture) => {
            if (recycledChunk) {
                const wall = side === 'left' ? recycledChunk.left : recycledChunk.right;
                wall.setTexture(texture);

                // Only update if dimensions changed significantly
                const currentW = wall.width;
                const currentH = wall.height;

                wall.width = w;
                wall.height = h;
                wall.setPosition(x, y);

                if (Math.abs(currentW - w) > 1 || Math.abs(currentH - h) > 1) {
                    // Re-set body for TileSprite ensures texture and hitbox sync
                    wall.setBody({ type: 'rectangle', width: w, height: h });
                    wall.setStatic(true);
                }

                wall.body.label = label;
                return wall;
            } else {
                const wall = this.add.tileSprite(x, y, w, h, texture);
                this.matter.add.gameObject(wall, {
                    isStatic: true,
                    label: label,
                    shape: { type: 'rectangle', width: w, height: h }
                });
                return wall;
            }
        };

        // Determine Wall Type for Left and Right separately
        // 85% Chance of Spike Wall in Challenge Mode
        // Determine Wall Type for Left and Right separately
        const getWallConfig = () => {
            if (phaseConfig.bossWallActive) {
                return { texture: 'bossWallTexture', suffix: '' };
            }
            if (phaseConfig.spikeWallActive) {
                if (Math.random() < 0.85) {
                    return { texture: 'spikeWallTexture', suffix: 'Spike' };
                }
            }
            return { texture: 'wallTexture', suffix: '' };
        };

        const leftConfig = getWallConfig();
        const rightConfig = getWallConfig();

        const leftWall = updateOrCreateWall(
            'left',
            this.leftWallThickness / 2,
            centerY,
            this.leftWallThickness,
            this.chunkHeight,
            'leftWall' + leftConfig.suffix,
            leftConfig.texture
        );

        const rightWall = updateOrCreateWall(
            'right',
            this.width - this.rightWallThickness / 2,
            centerY,
            this.rightWallThickness,
            this.chunkHeight,
            'rightWall' + rightConfig.suffix,
            rightConfig.texture
        );

        const obstacles = [];
        // Randomly spawn obstacles
        // One obstacle per chunk for now, or maybe 2?
        // Let's spawn 2 obstacles per chunk at random Y positions within the chunk
        if (phaseConfig.obstacles) {
            for (let i = 0; i < 2; i++) {
                const obsY = yPos + Math.random() * this.chunkHeight;
                const side = Math.random() > 0.5 ? 'left' : 'right';
                // 30% chance of Wall Obstacle
                const type = Math.random() < 0.3 ? 'wall_obstacle' : 'obstacle';
                const obs = this.spawnObstacle(obsY, side, type);
                obstacles.push(obs);
            }
        }

        /* 
        // Spawn Flying Enemy (Chance) - REMOVED for timer based spawning
        if (Math.random() < this.flyingEnemyConfig.spawnChance) {
            const flyY = yPos + Math.random() * this.chunkHeight;
            const enemy = this.spawnFlyingEnemy(flyY);
            // 20% chance for a second one if it's a mosquito
            if (enemy.type === 'mosquito' && Math.random() < 0.2) {
                this.spawnFlyingEnemy(flyY + 50);
            }
        }
        */

        if (recycledChunk) {
            recycledChunk.left = leftWall;
            recycledChunk.right = rightWall;
            recycledChunk.obstacles = obstacles;
            recycledChunk.y = yPos;
        } else {
            this.wallChunks.push({ left: leftWall, right: rightWall, obstacles, y: yPos });
        }

        // --- Pattern: Horizontal Gates ---
        if (this.phaseManager.currentPhase === 'CHALLENGE' && this.phaseManager.activePattern === 'GATES') {
            // Spawn 1 horizontal gate per chunk
            const gateY = yPos + this.chunkHeight / 2;
            const gapWidth = 100;

            // Gap should be relative to current passage center
            const passageCenter = (this.width / 2) + this.pathOffset;
            const gapX = passageCenter;

            // Left part of gate (from left wall to gap)
            const leftEdge = this.leftWallThickness;
            const leftGateW = (gapX - gapWidth / 2) - leftEdge;
            if (leftGateW > 0) {
                const leftGate = this.add.tileSprite(leftEdge + leftGateW / 2, gateY, leftGateW, 40, 'spikeWallTexture');
                this.matter.add.gameObject(leftGate, {
                    isStatic: true, label: 'horizontalSpikeWall',
                    shape: { type: 'rectangle', width: leftGateW, height: 40 }
                });
                obstacles.push(leftGate);
            }

            // Right part of gate (from gap to right wall)
            const rightEdge = this.width - this.rightWallThickness;
            const rightGateW = rightEdge - (gapX + gapWidth / 2);
            if (rightGateW > 0) {
                const rightGate = this.add.tileSprite(rightEdge - rightGateW / 2, gateY, rightGateW, 40, 'spikeWallTexture');
                this.matter.add.gameObject(rightGate, {
                    isStatic: true, label: 'horizontalSpikeWall',
                    shape: { type: 'rectangle', width: rightGateW, height: 40 }
                });
                obstacles.push(rightGate);
            }
        }

        this.lastChunkY = yPos;
    }

    spawnObstacle(y, side, type = 'obstacle') {
        const isWallObstacle = type === 'wall_obstacle';

        // Wall Obstacles are small (20x20), Regular are standard (50x30)
        const width = isWallObstacle ? 20 : 50;
        const height = isWallObstacle ? 20 : 30;

        // Colors: Wall=White, Floating=Yellow
        const color = isWallObstacle ? 0xffffff : 0xffff00;

        let x;
        if (isWallObstacle) {
            // Attached to wall
            x = side === 'left' ? this.leftWallThickness + width / 2 : this.width - this.rightWallThickness - width / 2;
        } else {
            // Floating - Random X between walls
            const padding = 20;
            const minX = this.leftWallThickness + width / 2 + padding;
            const maxX = this.width - this.rightWallThickness - width / 2 - padding;
            x = Phaser.Math.Between(minX, maxX);
        }

        const obstacle = this.createPhysicsRect(x, y, width, height, color, type);

        // Attach Game Logic properties
        obstacle.setData('health', 1);
        obstacle.setData('isWallObstacle', isWallObstacle);

        return obstacle;
    }

    spawnFlyingEnemy(y, enemyType = null) {
        // Determine Type if not set
        if (!enemyType) {
            enemyType = Math.random() < 0.3 ? 'tank' : 'mosquito';
        }

        const isTank = enemyType === 'tank';
        const config = isTank ? this.tankEnemyConfig : this.flyingEnemyConfig;

        // Random X position (avoiding walls)
        // Random X position (avoiding walls)
        const minX = this.leftWallThickness + 50;
        const maxX = this.width - this.rightWallThickness - 50;
        const x = Phaser.Math.Between(minX, maxX);

        // Core Enemy Body
        const enemy = this.matter.add.image(x, y, null, null, {
            isStatic: true, // Kinetic/Static so it doesn't fall by gravity alone (we control movement)
            isSensor: true, // overlap only
            label: 'flying_enemy',
            shape: isTank ? { type: 'rectangle', width: config.width, height: config.height } : 'circle',
            radius: !isTank ? config.width / 2 : undefined
        });

        // Rotate body for tank (Diamond shape) - Wait, matter body rotation...
        // For static sensor, visual rotation is enough, but if we want the hitbox to be diamond:
        if (isTank) {
            enemy.setRotation(Math.PI / 4);
        }

        // Visuals
        const visuals = this.add.container(x, y);

        // Enemy Sprite
        let bodyGfx;
        if (isTank) {
            // Purple Diamond
            bodyGfx = this.add.rectangle(0, 0, config.width, config.height, 0x800080);
            bodyGfx.rotation = Math.PI / 4;
        } else {
            // Red Circle (Mosquito)
            bodyGfx = this.add.circle(0, 0, config.width / 2, 0xff0000);
        }
        visuals.add(bodyGfx);

        // Shield Visual
        const shieldGfx = this.add.graphics();
        visuals.add(shieldGfx);

        const updateShieldVisual = (currentShield) => {
            shieldGfx.clear();
            if (currentShield <= 0) return;

            if (isTank) {
                // Multi-stage shield (Hexagon-ish or just Ring)
                // Color based on strength
                const colors = [0x00ffff, 0x0088ff, 0x8800ff]; // Light Blue -> Blue -> Purple
                const color = colors[Math.min(currentShield - 1, 2)];
                const thickness = 2 + currentShield; // Thicker when stronger

                shieldGfx.lineStyle(thickness, color, 1);
                // Draw Diamond Shield
                // effectively a rotated rect outline
                const r = config.shieldRadius;
                // Let's manually draw diamond path for safety
                shieldGfx.beginPath();
                shieldGfx.moveTo(0, -r);
                shieldGfx.lineTo(r, 0);
                shieldGfx.lineTo(0, r);
                shieldGfx.lineTo(-r, 0);
                shieldGfx.closePath();
                shieldGfx.strokePath();

            } else {
                // Check 'mosquito' simple ring
                shieldGfx.lineStyle(2, 0x00ffff, 1);
                shieldGfx.strokeCircle(0, 0, config.shieldRadius);
            }
        };


        // Health Bar
        const healthBarBg = this.add.rectangle(0, -40, 40, 6, 0x000000);
        const healthBarFill = this.add.rectangle(0, -40, 38, 4, 0x00ff00);
        healthBarFill.setOrigin(0, 0.5);
        healthBarFill.x = -19;

        visuals.add(healthBarBg);
        visuals.add(healthBarFill);

        // Interactive Zone for tapping - REMOVED for revamp
        // const hitZone = this.add.zone(0, 0, 70, 70).setInteractive();
        // visuals.add(hitZone);

        // Difficulty Scaling: +10% HP every 250m
        const depth = Math.max(0, this.distance);
        const healthMultiplier = 1 + Math.floor(depth / 250) * 0.10;
        const baseHp = config.hp || 5;
        const scaledHp = Math.ceil(baseHp * healthMultiplier);

        // Link Data
        const enemyData = {
            type: enemyType,
            body: enemy,
            visuals: visuals,
            shieldGfx: shieldGfx,
            updateShield: updateShieldVisual, // Function ref
            healthBarFill: healthBarFill,
            maxHealth: scaledHp,
            health: scaledHp,
            // hitZone: hitZone, // Removed

            // Shield
            shieldMax: isTank ? config.shieldHits : 1,
            shieldHealth: isTank ? config.shieldHits : 1,
            shieldActive: true,

            initialX: x,
            initialY: y,
            timeOffset: Math.random() * 1000,
            shootTimer: Phaser.Math.Between(15000, 25000), // Random start timer (Refined for fairness)

            // Tank specific
            burstCount: 0,
            isBursting: false
        };

        // Initialize Shield Visual
        updateShieldVisual(enemyData.shieldHealth);

        // Attach reference
        enemy.setData('enemyData', enemyData);

        // Tap interaction - REMOVED for revamp
        /*
        hitZone.on('pointerdown', () => {
            if (enemyData.shieldActive) {
                // Decrement Shield
                enemyData.shieldHealth--;
                enemyData.updateShield(enemyData.shieldHealth);
     
                // Visual Feedback
                this.tweens.add({
                    targets: bodyGfx,
                    scale: 1.2,
                    duration: 50,
                    yoyo: true
                });
     
                if (enemyData.shieldHealth <= 0) {
                    enemyData.shieldActive = false;
                    // Shield Break Sound/Effect here
                }
            }
        });
        */

        this.flyingEnemies.push(enemyData);
        return enemyData;
    }

    spawnBoss(y) {
        const bossData = this.boss.spawn(y);
        this.flyingEnemies.push(bossData);
        return bossData;
    }

    update(time, delta) {
        if (this.isGameOver) return;
        if (this.isPaused) return;

        // Manage Time
        const dt = delta * this.slowMoFactor; // Scaled Delta
        this.virtualTime += dt;
        this.matter.world.engine.timing.timeScale = this.slowMoFactor;

        // Sync Visuals
        this.updateHomingMissiles(dt);
        this.playerVisual.setPosition(this.player.x, this.player.y);

        // Sync Attached Smokes
        if (this.attachedSmokes) {
            for (let i = this.attachedSmokes.length - 1; i >= 0; i--) {
                const smoke = this.attachedSmokes[i];
                if (smoke.active) {
                    smoke.setPosition(this.player.x + smoke.relativeX, this.player.y + smoke.relativeY);
                } else {
                    this.attachedSmokes.splice(i, 1);
                }
            }
        }



        // Update Texture based on Start
        let targetTexture = 'playerIdle';

        if (this.isShooting && this.touchingWallCount === 0) {
            targetTexture = 'playerShoot';
        } else if (this.touchingWallCount > 0) {
            const onLeft = this.player.x < this.width / 2;
            targetTexture = onLeft ? 'playerSlideLeft' : 'playerSlideRight';
        }

        if (this.playerVisual.texture.key !== targetTexture) {
            this.playerVisual.setTexture(targetTexture);
        }

        // Note: physics rotation is 0 usually, but if we want visual tilt, we tween `playerVisual`

        // 1. Camera Scroll
        this.cameras.main.scrollY += this.scrollSpeed * this.slowMoFactor;
        const camY = this.cameras.main.scrollY;

        // 2. Infinite Walls Logic
        // Remove chunks that are far above the camera
        // A chunk is defined by starting Y. 
        // If chunk.y + chunkHeight < camY - tolerance, it's gone.
        // Let's recycle it to the bottom.

        const cleanupThreshold = camY - this.chunkHeight; // If explicit Top of chunk is way above

        // Check the first chunk in the list (oldest/highest)
        const firstChunk = this.wallChunks[0];
        if (firstChunk && firstChunk.y < cleanupThreshold) {
            // Cleanup Old Obstacles - they are now GameObjects
            firstChunk.obstacles.forEach(obs => obs.destroy());
            firstChunk.obstacles = [];

            // Move this chunk to the bottom
            // New Y = lastChunkY + chunkHeight
            const newY = this.wallChunks[this.wallChunks.length - 1].y + this.chunkHeight;

            // Call createWallChunk with the recycled chunk to handle zone logic and path winding
            this.createWallChunk(newY, firstChunk);

            // Move to end of array
            this.wallChunks.shift();
            this.wallChunks.push(firstChunk);
        }

        // 3. Player Out of Bounds Check
        const resetThresholdTop = camY - 200; // Player left behind by camera (Death)
        const portalThresholdBottom = camY + this.height; // Player fell past bottom (Portal)

        if (this.player.y < resetThresholdTop) {
            // Player got left behind (off top of screen) -> Reset/Die
            this.gameOver();
        } else if (this.player.y > portalThresholdBottom) {
            // Player fell off bottom -> Portal to top
            // Shift player up by exactly one screen height
            // This places them at the top of the screen, maintaining X and velocities.
            this.player.setPosition(this.player.x, this.player.y - this.height);
        }

        // 4. Clamp Player to Top of Camera (Prevent Recoil/Jump above screen)
        const clampPadding = 20;
        const topLimit = camY + clampPadding;

        if (this.player.y < topLimit) {
            this.player.setPosition(this.player.x, topLimit);
            // If moving UP (slower than camera), sync to camera speed to "ceiling"
            if (this.player.body.velocity.y < this.scrollSpeed) {
                this.player.setVelocityY(this.scrollSpeed);
            }
        }

        // 5. Update Flying Enemies
        // Reverse loop for safe removal
        for (let i = this.flyingEnemies.length - 1; i >= 0; i--) {
            const enemy = this.flyingEnemies[i];

            // Cleanup check
            // Fix: Allow enemies to exist deep in the next chunks (up to 2 chunk heights below)
            const bottomLimit = camY + this.chunkHeight * 2;
            const topLimit = camY - this.height; // Allow them to be a screen above before deleting (in case they fly up)

            // Check correctness of body existence
            // FIX: Exempt Boss from bottom limit check, as it spawns deep in the new chunk
            const isBoss = enemy.type === 'boss';
            if (!enemy.body || !enemy.body.active || enemy.body.y < topLimit || (!isBoss && enemy.body.y > bottomLimit)) {
                // Destroy
                // Check if it was the BOSS? If boss falls off screen, maybe just respawn it or kill it?
                // For now, if boss falls out of bounds (should stick to player), destroy it.
                if (enemy.type === 'boss') {
                    // Fail safe: Boss shouldn't die by falling off unless player ran super fast?
                    // Actually, if boss is deleted, we might be stuck in boss mode.
                    // Let's ensure handleEnemyDeath logic runs or we force a win.
                    // But standard logic is fine for now.
                }
                this.destroyFlyingEnemy(i);
                continue;
            }

            if (enemy.type === 'boss') {
                this.updateBoss(enemy, dt, camY);
                continue;
            }

            // --- Movement Logic ---

            // 1. Horizontal Patrol (Slow)
            // Oscillate across width
            const patrolWidth = (this.width - this.wallThickness * 2 - 100) / 2;
            const centerX = this.width / 2;
            const timeOffset = this.virtualTime + enemy.timeOffset;
            const patrolX = centerX + Math.sin(timeOffset * 0.001) * patrolWidth; // Slower frequency (0.001)

            let targetX = patrolX;

            // 2. Vertical Position (Lock to Bottom of Screen)
            // Goal: "Stay at the bottom of the screen"
            // We want it to be near the bottom, maybe 150px from bottom?
            const targetScreenY = camY + this.height - 150;
            // Add a small bob
            const bobY = Math.sin(timeOffset * 0.002) * 20;

            let targetY = targetScreenY + bobY;

            // 3. Avoid Player (Repulsion) - Keep distance
            const distToPlayer = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.body.x, enemy.body.y);
            const safeDistance = 300; // Keep reasonable distance
            if (distToPlayer < safeDistance) {
                // Determine direction away from player
                const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.body.x, enemy.body.y);

                // Repulse mainly horizontally if locked to bottom?
                // Or just let it push X
                const pushX = Math.cos(angle);
                targetX += pushX * 20;
            }

            // Clamp X
            targetX = Phaser.Math.Clamp(targetX, this.wallThickness + 25, this.width - this.wallThickness - 25);

            enemy.body.setPosition(targetX, targetY);
            enemy.visuals.setPosition(targetX, targetY);

            // Shooting Logic
            const isTank = enemy.type === 'tank';
            const config = isTank ? this.tankEnemyConfig : this.flyingEnemyConfig;

            if (isTank && enemy.isBursting) {
                // Burst Mode
                enemy.shootTimer -= dt; // Reuse shootTimer for burst interval
                if (enemy.shootTimer <= 0) {
                    this.enemyShoot(enemy);
                    enemy.burstCount++;
                    enemy.shootTimer = 150; // Fast burst interval

                    if (enemy.burstCount >= 3) {
                        enemy.isBursting = false;
                        enemy.shootTimer = Phaser.Math.Between(10000, 20000);
                    }
                }
            } else {
                // Normal Timer
                enemy.shootTimer -= dt;
                if (enemy.shootTimer <= 0 && distToPlayer < this.height * 1.5) {
                    if (isTank) {
                        // Start Burst
                        enemy.isBursting = true;
                        enemy.burstCount = 0;
                        enemy.shootTimer = 0; // Trigger first shot immediately
                    } else {
                        // Single Shot (Mosquito)
                        this.enemyShoot(enemy);
                        enemy.shootTimer = Phaser.Math.Between(10000, 20000);
                    }
                }
            }
        }

        // --- NEW: Spawning Logic with Delay ---
        const phaseConfig = this.phaseManager.getCurrentConfig();
        if (phaseConfig.enemies && this.flyingEnemies.length === 0) {
            if (this.enemySpawnTimer === 0) {
                // Last enemy just died or game started, set timer for 3-10 seconds
                this.enemySpawnTimer = this.virtualTime + Phaser.Math.Between(3000, 10000);
            } else if (this.virtualTime >= this.enemySpawnTimer) {
                // Timer reached, spawn new enemy
                const spawnY = camY + this.height + 100; // Spawn slightly below screen
                const enemy = this.spawnFlyingEnemy(spawnY);

                // 20% chance for a second one if it's a mosquito
                if (enemy.type === 'mosquito' && Math.random() < 0.2) {
                    this.spawnFlyingEnemy(spawnY + 50);
                }

                // Reset timer for next cycle after this one dies
                this.enemySpawnTimer = 0;
            }
        } else {
            // Reset timer if enemies somehow exist (safety)
            this.enemySpawnTimer = 0;
        }

        // --- Boss Trigger Check ---
        // (Moved into updatePhaseProgress for checking thresholds, 
        //  but we need to check spawns here specifically)

        // --- Distance Update ---
        // Only update reported distance if boss is not diverting it
        if (this.phaseManager.currentPhase !== 'BOSS') {
            this.distance = Math.floor(this.cameras.main.scrollY / 10);
            this.distanceText.setText(`${this.distance}m`);
        } else {
            this.distanceText.setText(`BOSS!`);
            this.distanceText.setColor('#ff0000');
        }

        this.applyWallFriction();

        // 6. Cleanup Projectiles
        for (let i = this.allProjectiles.length - 1; i >= 0; i--) {
            const p = this.allProjectiles[i];
            if (!p.active || p.y < camY - 100 || p.y > camY + this.height + 100) {
                if (p.active) p.destroy();
                this.allProjectiles.splice(i, 1);
            }
        }

        if (this.isDebug) this.updateDebugUI();
    }

    destroyFlyingEnemy(index) {
        const enemy = this.flyingEnemies[index];
        if (enemy) {
            if (enemy.body && enemy.body.body) {
                this.matter.world.remove(enemy.body.body);
            }
            if (enemy.body) enemy.body.destroy(); // Body Image which is also the GameObject
            if (enemy.visuals) enemy.visuals.destroy(); // Container
            this.flyingEnemies.splice(index, 1);
        }
    }

    updateBoss(boss, dt, camY) {
        this.boss.update(boss, dt, camY);
    }




    createEnemyProjectile(x, y, angle, speed, color = 0xff00ff) {
        // Increase size slightly for visible (14x14)
        const projectile = this.createPhysicsRect(x, y, 14, 14, color, 'enemy_projectile', true, {
            ignoreGravity: true,
            friction: 0,
            frictionAir: 0,
            restitution: 1
        });

        // Explicitly enforce Body properties
        if (projectile.body) {
            projectile.body.ignoreGravity = true;
            this.matter.body.setInertia(projectile.body, Infinity); // prevent rotation being affected?
        }

        projectile.setStrokeStyle(2, 0xffffff); // White outline
        projectile.setDepth(500); // Ensure visible on top of everything

        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        projectile.setVelocity(vx, vy);
        this.allProjectiles.push(projectile);

        // console.log('Projectile Spawned:', x, y, vx, vy);
    }

    enemyShoot(enemy) {
        // Shoot targeting player - but primarily UPWARDS and ignore gravity
        const startX = enemy.body.x;
        const startY = enemy.body.y;

        // Standard Enemy Shot - Make it BRIGHT RED with White Stroke
        this.createEnemyProjectile(startX, startY, 0, 0, 0xFF0000);
        const projectile = this.allProjectiles[this.allProjectiles.length - 1];

        let vectorX = this.player.x - startX;
        let vectorY = this.player.y - startY;

        // Force an UPWARD trajectory if it's too horizontal or downward
        // Since we want "shoot back" but "upward" (player is usually falling from above)
        if (vectorY > -0.5) {
            vectorY = -1; // Force upward
        }

        const length = Math.sqrt(vectorX * vectorX + vectorY * vectorY);
        const speed = 4; // Slower than player bullets

        const velocityX = (vectorX / length) * speed;
        const velocityY = (vectorY / length) * speed;

        projectile.setVelocity(velocityX, velocityY);
        this.allProjectiles.push(projectile);
    }

    gameOver() {
        if (this.isGameOver) return;
        this.isGameOver = true;

        // Stop Scrolling
        this.scrollSpeed = 0;

        // Visual Death
        this.playerVisual.setTint(0xff0000);
        this.player.setVelocity(0, 0);
        this.player.setStatic(true); // Freeze physics

        // Game Over UI
        const cam = this.cameras.main;
        const cx = cam.worldView.x + cam.width / 2;
        const cy = cam.worldView.y + cam.height / 2;

        const bg = this.add.rectangle(cx, cy, this.width, this.height, 0x000000, 0.7).setDepth(3000);

        this.add.text(cx, cy - 50, 'GAME OVER', {
            fontSize: '64px',
            fontFamily: 'Arial Black',
            color: '#ff0000',
            stroke: '#ffffff',
            strokeThickness: 6
        }).setOrigin(0.5).setDepth(3001);

        this.add.text(cx, cy + 50, 'Tap to Restart', {
            fontSize: '32px',
            fontFamily: 'Arial',
            color: '#ffffff'
        }).setOrigin(0.5).setDepth(3001);

        // Restart Input
        this.input.once('pointerdown', () => {
            this.scene.restart();
        });
    }

    resetPlayer(camY) {
        // Reset Health
        this.playerHealth = this.playerMaxHealth;
        this.updateHealthUI();

        // Reset to random wall
        const startSide = Math.random() > 0.5 ? 'left' : 'right';

        const startX = startSide === 'left'
            ? this.wallThickness + this.playerSize.w / 2 + 1
            : this.width - this.wallThickness - this.playerSize.w / 2 - 1;

        this.player.setPosition(startX, camY + this.height / 3);
        this.player.setVelocity(0, 0);
        this.player.setAngularVelocity(0);
        this.player.setRotation(0);

        // Reset Visuals completely
        this.tweens.killTweensOf(this.playerVisual); // Stop all running tweens
        this.playerVisual.setRotation(0);
        this.playerVisual.setScale(1);
        this.playerVisual.clearTint();
        this.playerVisual.setAlpha(1);

        // Push into wall
        this.player.applyForce({ x: startSide === 'left' ? -0.01 : 0.01, y: 0 });

        this.touchingWallCount = 0; // Reset contact state
    }

    handleCollisionStart(event) {
        let land = false;
        event.pairs.forEach(pair => {
            if (this.isPlayerWallPair(pair.bodyA, pair.bodyB)) {

                const labels = [pair.bodyA.label, pair.bodyB.label];
                const isDanger = labels.some(l => l && (l.includes('Spike') || l.includes('Gate') || l === 'horizontalSpikeWall'));

                if (!isDanger) {
                    // Only count as "touching wall" (sliding/jump reset) if it's a safe wall
                    this.touchingWallCount++;
                    land = true;

                    // Reload Ammo
                    if (this.currentAmmo < GameConfig.Ammo.Max) {
                        this.currentAmmo = GameConfig.Ammo.Max;
                        this.updateAmmoUI();
                    }
                } else {
                    // It's a danger wall
                    const wallBody = pair.bodyA === this.player.body ? pair.bodyB : pair.bodyA;
                    this.handleSpikeCollision(wallBody);
                }
            }

            // Check obstacle collision
            const obstacleBody = this.getObstacleFromBody(pair.bodyA, pair.bodyB);
            if (obstacleBody) {
                this.handleObstacleCollision(obstacleBody);
            }

            // Check projectile collision
            this.handleProjectileCollision(pair.bodyA, pair.bodyB);
        });

        if (land) {
            // Landing Effects - Apply to Visual Only!

            // Stop previous squash logic
            if (this.squashTween) {
                this.squashTween.stop();
                this.playerVisual.setScale(1);
            }

            // 1. Bounce (Squash)
            this.squashTween = this.tweens.add({
                targets: this.playerVisual,
                scaleX: 1.3,
                scaleY: 0.8,
                duration: 50,
                yoyo: true,
                ease: 'Quad.easeInOut',
                onComplete: () => {
                    this.playerVisual.setScale(1); // Ensure hard reset
                    this.squashTween = null;
                }
            });

            // Stop previous tilt logic
            if (this.tiltTween) {
                this.tiltTween.stop();
                this.playerVisual.setRotation(0);
            }

            // 2. Tilt
            const onLeft = this.player.x < this.width / 2;
            const tiltAngle = onLeft ? 0.1 : -0.1;

            this.tiltTween = this.tweens.add({
                targets: this.playerVisual,
                rotation: tiltAngle,
                duration: 100,
                yoyo: true,
                onComplete: () => {
                    this.tiltTween = null;
                }
            });

            // Camera Shake
            this.cameras.main.shake(100, 0.005);
        }
    }

    handleProjectileCollision(bodyA, bodyB) {
        // Player Projectile
        const projectile = bodyA.label === 'projectile' ? bodyA : bodyB.label === 'projectile' ? bodyB : null;

        // Enemy Projectile
        const enemyProjectile = bodyA.label === 'enemy_projectile' ? bodyA : bodyB.label === 'enemy_projectile' ? bodyB : null;

        // Player
        const player = bodyA.label === 'player' ? bodyA : bodyB.label === 'player' ? bodyB : null;

        // Wall/Obstacle logic
        let obstacle = bodyA.label === 'obstacle' || bodyA.label === 'wall_obstacle' ? bodyA : null;
        if (!obstacle) {
            obstacle = bodyB.label === 'obstacle' || bodyB.label === 'wall_obstacle' ? bodyB : null;
        }

        // Flying Enemy logic
        let flyingEnemy = bodyA.label === 'flying_enemy' ? bodyA : (bodyB.label === 'flying_enemy' ? bodyB : null);

        // --- Enemy Projectile Logic ---
        if (enemyProjectile) {
            // Hit Player
            if (player) {
                if (enemyProjectile.gameObject) {
                    const idx = this.allProjectiles.indexOf(enemyProjectile.gameObject);
                    if (idx > -1) this.allProjectiles.splice(idx, 1);
                    enemyProjectile.gameObject.destroy();
                }
                this.matter.world.remove(enemyProjectile);

                // Damage Player
                this.playerHealth -= 10;
                this.updateHealthUI();
                this.cameras.main.shake(100, 0.01);

                // Visual Damage Effect
                this.playDamageEffect();

                if (this.playerHealth <= 0) {
                    this.scene.start('GameOverScene', { distance: this.distance });
                }
                return;
            }

            // Hit Wall or Obstacle (Destroy Bullet)
            // If it hits anything else static like walls

            // FIX: Ignore collision with the shooter (Flying Enemy / Boss)
            // Since Boss is Static, it was destroying its own bullets on spawn.
            const otherBody = enemyProjectile === bodyA ? bodyB : bodyA;
            if (otherBody.label === 'flying_enemy') return;

            if (obstacle || bodyA.isStatic || bodyB.isStatic) {
                if (enemyProjectile.gameObject) {
                    const idx = this.allProjectiles.indexOf(enemyProjectile.gameObject);
                    if (idx > -1) this.allProjectiles.splice(idx, 1);
                    enemyProjectile.gameObject.destroy();
                }
                this.matter.world.remove(enemyProjectile);
                return;
            }
        }

        // --- Player Projectile Logic ---
        if (projectile) {

            if (flyingEnemy) {
                // Destroy projectile
                if (projectile.gameObject) {
                    const idx = this.allProjectiles.indexOf(projectile.gameObject);
                    if (idx > -1) this.allProjectiles.splice(idx, 1);
                    projectile.gameObject.destroy();
                }
                this.matter.world.remove(projectile);

                const enemyGO = flyingEnemy.gameObject;
                if (!enemyGO) return; // Fix: Prevent crash if enemy was already destroyed this frame

                const data = enemyGO.getData('enemyData');

                if (data) {
                    // Reactive Shoot Back!
                    // Check for internal cooldown to prevent bullet spam
                    const now = this.time.now;
                    if (!data.lastReactiveShot || now - data.lastReactiveShot > 400) {
                        if (data.type !== 'boss') {
                            this.enemyShoot(data);
                        }
                        data.lastReactiveShot = now;
                    }

                    if (data.shieldActive) {
                        // Damage shield instead of body
                        data.shieldHealth--;
                        data.updateShield(data.shieldHealth);

                        // Visual feedback on shield
                        this.tweens.add({
                            targets: data.shieldGfx,
                            alpha: 0.2,
                            duration: 50,
                            yoyo: true,
                            repeat: 3
                        });

                        if (data.shieldHealth <= 0) {
                            data.shieldActive = false;
                            // Shield Break effect
                        }
                    } else {
                        // Hit! Decrease health
                        const pDamage = projectile.gameObject ? (projectile.gameObject.getData('damage') || 1) : 1;
                        data.health -= pDamage;

                        // Visual feedback for hit (Flash White)
                        this.tweens.add({
                            targets: data.visuals,
                            alpha: 0.5,
                            duration: 50,
                            yoyo: true,
                            onStart: () => {
                                // Update Health Bar
                                const healthPct = data.health / data.maxHealth;
                                data.healthBarFill.scaleX = Math.max(0, healthPct);
                            }
                        });

                        if (data.health <= 0) {
                            const idx = this.flyingEnemies.indexOf(data);
                            if (idx > -1) {
                                this.destroyFlyingEnemy(idx);
                                this.handleEnemyDeath(data.type);
                                // TEST: Trigger upgrade on every kill
                                this.triggerUpgradeSequence();
                            }
                        }
                    }
                }
                return;
            }

            if (obstacle) {
                // Destroy projectile immediately
                if (projectile.gameObject) {
                    const idx = this.allProjectiles.indexOf(projectile.gameObject);
                    if (idx > -1) this.allProjectiles.splice(idx, 1);
                    projectile.gameObject.destroy();
                }
                this.matter.world.remove(projectile);

                // Access GameObject from Body
                const obstacleGO = obstacle.gameObject;
                if (!obstacleGO) return; // Should exist

                if (obstacleGO.getData('isWallObstacle')) {
                    // Indestructible: Visual ping but no damage
                    obstacleGO.fillColor = 0xcccccc; // Grey tint flash
                    this.time.delayedCall(50, () => {
                        if (obstacleGO.active) obstacleGO.fillColor = 0xffffff;
                    });
                    return; // Do nothing else
                }

                // Damage Obstacle
                const currentHealth = obstacleGO.getData('health') || 1;
                const pDamage = projectile.gameObject ? (projectile.gameObject.getData('damage') || 1) : 1;
                obstacleGO.setData('health', currentHealth - pDamage);

                // Visual Feedback for hit
                obstacleGO.fillColor = 0xffffff;
                this.time.delayedCall(50, () => {
                    if (obstacleGO.active) obstacleGO.fillColor = 0xffff00;
                });

                if (obstacleGO.getData('health') <= 0) {
                    this.destroyObstacle(obstacleGO);
                }
            }
        }
    }

    destroyObstacle(obstacleGO) {
        // Remove from current chunks tracking
        this.wallChunks.forEach(chunk => {
            const idx = chunk.obstacles.indexOf(obstacleGO);
            if (idx > -1) {
                chunk.obstacles.splice(idx, 1);
            }
        });

        obstacleGO.destroy(); // Removes visual and body
        // Explosion?
    }

    getObstacleFromBody(bodyA, bodyB) {
        if (bodyA.label === 'player') {
            if (bodyB.label === 'obstacle' || bodyB.label === 'wall_obstacle') return bodyB;
        }
        if (bodyB.label === 'player') {
            if (bodyA.label === 'obstacle' || bodyA.label === 'wall_obstacle') return bodyA;
        }
        return null;
    }

    handleObstacleCollision(obstacleBody) {
        const obstacleGO = obstacleBody.gameObject;
        if (!obstacleGO) return;

        const isWallObstacle = obstacleGO.getData('isWallObstacle');
        const onLeft = obstacleGO.x < this.width / 2; // Cache side BEFORE destruction

        // 1. Always Destroy Obstacle (Break off)
        this.destroyObstacle(obstacleGO);

        // 2. Apply Pushback if Wall Obstacle
        if (isWallObstacle) {
            // Push away from wall
            // If on Left wall, push Right (+). If on Right wall, push Left (-).
            const pushForce = 0.20; // Much stronger push (was 0.08)
            const forceX = onLeft ? pushForce : -pushForce;

            // Also add a little upward/downward randomization or just pure horizontal?
            // Pure horizontal is clearer for "push off".
            // Maybe a slight upward pop to clear the collision?
            this.player.applyForce({ x: forceX, y: -0.01 });
        }

        // 3. Logic: Heal or Damage?
        const yellowHealLevel = this.passiveLevels['YELLOW_OBSTACLE_HEAL'] || 0;

        if (!isWallObstacle && yellowHealLevel > 0) {
            // Apply Healing (Yellow Obstacle only)
            const config = GameConfig.Passives.YELLOW_OBSTACLE_HEAL;
            const healPct = config.baseHeal + (yellowHealLevel - 1) * config.healPerLevel;
            const healAmount = Math.floor(this.playerMaxHealth * healPct);

            this.playerHealth = Math.min(this.playerMaxHealth, this.playerHealth + healAmount);
            this.updateHealthUI();

            console.log(`Yellow Obstacle Heal! Level ${yellowHealLevel}. Healed: ${healAmount}. HP: ${this.playerHealth}`);

            // Visual Feedback (Green Flash)
            if (this.damageTween) this.damageTween.stop();
            this.damageTween = this.tweens.add({
                targets: this.playerVisual,
                duration: 100,
                alpha: 1,
                yoyo: true,
                repeat: 1,
                onStart: () => this.playerVisual.setTint(0x00ff00), // Green tint
                onComplete: () => {
                    this.playerVisual.clearTint();
                    this.playerVisual.setAlpha(1);
                    this.damageTween = null;
                }
            });

            return; // EXIT EARLY - NO DAMAGE
        }

        // 4. Apply Damage (Default)
        if (!this.isDebug && !this.debugInvincible) {
            this.playerHealth -= 20;
        }
        this.updateHealthUI();

        // 5. Visual Feedback (Red Flash)
        this.playDamageEffect();

        // Shake
        this.cameras.main.shake(100, 0.01);

        // 5. Check Death
        if (this.playerHealth <= 0) {
            this.gameOver();
        }
    }

    updateHealthUI() {
        if (!this.healthBarFill) return;
        const healthPct = Math.max(0, this.playerHealth / this.playerMaxHealth);
        this.healthBarFill.width = 100 * healthPct;

        // Color transition
        if (healthPct < 0.3) this.healthBarFill.setFillStyle(0xff0000);
        else if (healthPct < 0.6) this.healthBarFill.setFillStyle(0xffff00);
        else this.healthBarFill.setFillStyle(0x00ff00);
    }

    handleCollisionEnd(event) {
        event.pairs.forEach(pair => {
            if (this.isPlayerWallPair(pair.bodyA, pair.bodyB)) {
                this.touchingWallCount = Math.max(0, this.touchingWallCount - 1);
            }
        });
    }

    isPlayerWallPair(bodyA, bodyB) {
        const labels = [bodyA.label, bodyB.label];
        const hasPlayer = labels.includes('player');
        const hasWall = labels.some(l => l && (l.includes('Wall') || l.includes('Spike') || l.includes('Gate')));
        return hasPlayer && hasWall;
    }

    handleSpikeCollision(wallBody) {
        // Prevent rapid damage (Invincibility frames)
        if (this.isInvincible) return;

        // Check if it's a breakable horizontal spike wall
        const isHorizontal = wallBody.label === 'horizontalSpikeWall';

        let damage = 15;

        // Apply Redwall Hurt Less Reduction
        const redwallLevel = this.passiveLevels['REDWALL_HURT_LESS'] || 0;
        if (redwallLevel > 0) {
            const config = GameConfig.Passives.REDWALL_HURT_LESS;
            const reduction = config.baseReduction + (redwallLevel - 1) * config.reductionPerLevel;
            // Cap reduction at 100% just in case
            const finalReduction = Math.min(1.0, reduction);
            damage = Math.floor(damage * (1.0 - finalReduction));
            console.log(`Redwall Hit! Level ${redwallLevel}. Reduction: ${finalReduction.toFixed(2)}. Damage: 15 -> ${damage}`);
        }

        if (!this.isDebug && !this.debugInvincible) {
            this.playerHealth -= damage;
        }
        this.updateHealthUI();

        this.isInvincible = true;
        this.time.delayedCall(500, () => { this.isInvincible = false; });

        if (isHorizontal) {
            // --- Break Through Logic ---
            // 1. Destroy the wall (visual + physics)
            if (wallBody.gameObject) {
                this.destroyObstacle(wallBody.gameObject);
            }

            // 2. Visual Impact Effect (Particles)
            // Use existing dust emitter or creating a quick burst
            if (this.dustEmitter) {
                this.dustEmitter.setPosition(this.player.x, this.player.y);
                this.dustEmitter.explode(10); // Burst
            }

            // 3. NO Pushback - Player continues momentum
            // Maybe slight slowdown?
            // this.player.setVelocity(this.player.body.velocity.x * 0.8, this.player.body.velocity.y * 0.8);

        } else {
            // --- Standard Spike Wall (Vertical) Logic ---

            // Apply Pushback Force
            if (wallBody) {
                // Determine direction: Push AWAY from the wall
                // If player is to the left of wall, push left (-). If right, push right (+).
                // Usually walls are on sides, so we compare center X.
                const pushDirection = this.player.x < wallBody.position.x ? -1 : 1;

                // Apply strong horizontal force + slight vertical pop
                this.player.setVelocityX(pushDirection * 15);
            }
        }

        // Visual feedback (Common)
        this.cameras.main.shake(150, 0.02);
        this.playDamageEffect();

        // Check death
        if (this.playerHealth <= 0) {
            this.gameOver();
        }
    }

    applyWallFriction() {
        // Ensure count is never negative (safety)
        if (this.touchingWallCount < 0) this.touchingWallCount = 0;

        if (this.touchingWallCount > 0) {
            this.player.setFrictionAir(0.2); // Slow slide

            // Emit dust
            const onLeft = this.player.x < this.width / 2;

            // Offset emitter to wall side
            // Use playerSize.w / 2 to find edge
            const xOffset = onLeft ? -this.playerSize.w / 2 : this.playerSize.w / 2;

            this.dustEmitter.setPosition(this.player.x + xOffset, this.player.y);
            this.dustEmitter.start();
        } else {
            this.player.setFrictionAir(0.005); // Free fall (very low resistance)
            this.dustEmitter.stop();
        }
    }



    updateHomingMissiles(dt) {
        if (!this.allProjectiles.length) return;

        const config = GameConfig.Weapons.HOMING;
        // Collect potential targets once per frame? Or just search per missile (simpler for now)
        // Targets: Flying Enemies, Yellow Obstacles (isWallObstacle == false)

        this.allProjectiles.forEach(proj => {
            if (!proj.getData('isHoming')) return;

            // Emit Trail
            if (this.missileTrailEmitter) {
                this.missileTrailEmitter.emitParticleAt(proj.x, proj.y);
            }

            const body = proj.body;
            if (!body) return; // Destroyed?

            // 1. Find Closest Target
            let closestTarget = null;
            let minDistSq = config.searchRadius * config.searchRadius;

            // A. Enemies
            this.flyingEnemies.forEach(enemyData => {
                // Check if active
                if (enemyData.health > 0) {
                    // enemyData.body is the Phaser GameObject (Matter Image)
                    // It has .x and .y directly.
                    // It also has .body which is the Matter Body.

                    // Use GameObject position for distance check (safer?)
                    const enemyGO = enemyData.body;
                    if (!enemyGO || !enemyGO.active) return;

                    const ex = enemyGO.x;
                    const ey = enemyGO.y;
                    const d2 = (ex - body.position.x) ** 2 + (ey - body.position.y) ** 2;
                    if (d2 < minDistSq) {
                        minDistSq = d2;
                        // Store the MATTER BODY for steering logic (it has .position)
                        closestTarget = enemyGO.body;
                    }
                }
            });

            // B. Yellow Obstacles
            // Loop through visible chunks
            this.wallChunks.forEach(chunk => {
                chunk.obstacles.forEach(obs => {
                    const obsGO = obs.gameObject; // Wait, obs IS the GameObject usually
                    // obs is the gameObject. body is obs.body.
                    if (obs.active && !obs.getData('isWallObstacle')) {
                        const d2 = (obs.x - body.position.x) ** 2 + (obs.y - body.position.y) ** 2;
                        if (d2 < minDistSq) {
                            minDistSq = d2;
                            closestTarget = obs.body;
                        }
                    }
                });
            });

            if (closestTarget) {
                // 2. Steer towards target
                const targetPos = closestTarget.position;
                const currentVel = body.velocity;
                const currentAngle = Math.atan2(currentVel.y, currentVel.x);
                const targetAngle = Math.atan2(targetPos.y - body.position.y, targetPos.x - body.position.x);

                // Shortest angular distance
                let diff = targetAngle - currentAngle;
                if (diff < -Math.PI) diff += Math.PI * 2;
                if (diff > Math.PI) diff -= Math.PI * 2;

                // Max turn rate
                const turn = Math.max(-config.turnRate, Math.min(config.turnRate, diff));
                const newAngle = currentAngle + turn;

                // Set new velocity
                const speed = config.speed; // Constant speed
                const vx = Math.cos(newAngle) * speed;
                const vy = Math.sin(newAngle) * speed;

                proj.setVelocity(vx, vy);
                proj.setRotation(newAngle - Math.PI / 2);
            }
        });
    }

    handleEnemyDeath(enemyType) {
        if (enemyType === 'boss') {
            console.log('Boss Defeated!');

            // Reset Phase State
            // Transition back to normal loop
            this.phaseManager.currentPhase = 'NORMAL';
            this.phaseManager.bossActive = false;
            this.phaseManager.nextBossThreshold += GameConfig.PhaseConfig.Boss.DistanceInterval;
            this.phaseManager.chunksSinceChange = 0;
            this.phaseManager.activePattern = 'NONE';
            this.phaseManager.loopIndex = 0; // Restart loop

            this.distanceText.setColor('#ffffff');

            // Clear Projectiles
            this.allProjectiles.forEach(p => {
                if (p.active) p.destroy();
            });
            this.allProjectiles = [];

            // Maybe heal player full?
            this.playerHealth = this.playerMaxHealth;
            this.updateHealthUI();
        }

        this.enemiesKilled++;
        this.currentKillProgress++;

        // Determine required kills for next upgrade
        const tier = Math.min(this.totalUpgradesCount, GameConfig.Upgrades.KillsPerTier.length - 1);
        const requiredKills = GameConfig.Upgrades.KillsPerTier[tier];

        console.log(`Kills: ${this.currentKillProgress}/${requiredKills} (Tier ${tier + 1})`);

        if (this.currentKillProgress >= requiredKills) {
            this.triggerUpgradeSequence();
            // Note: currentKillProgress is reset in selectUpgrade
        }
    }

    triggerUpgradeSequence() {
        // Slow down time
        this.tweens.add({
            targets: this,
            slowMoFactor: 0,
            duration: 1000,
            onComplete: () => {
                this.slowMoFactor = 0; // Ensure 0
                this.createUpgradeUI();
            }
        });
    }



    createPauseButton() {
        const btn = document.createElement('button');
        btn.innerText = '⏸'; // Pause Icon
        btn.style.position = 'absolute';
        btn.style.top = '20px';
        btn.style.left = '50%';
        btn.style.transform = 'translateX(-50%)';
        btn.style.padding = '5px 15px'; // Smaller padding
        btn.style.fontSize = '20px'; // Slightly larger icon
        btn.style.fontWeight = 'bold';
        btn.style.backgroundColor = '#ff8800'; // Orange for "Control"
        btn.style.color = 'white';
        btn.style.border = '2px solid white';
        btn.style.borderRadius = '8px';
        btn.style.cursor = 'pointer';
        btn.style.zIndex = '1000';
        btn.style.userSelect = 'none'; // Prevent text selection on hold
        btn.id = 'pause-btn';

        let holdTimer = null;
        let isLongPress = false;

        const startHold = () => {
            isLongPress = false;
            btn.style.backgroundColor = '#ff4400'; // Darker orange on press
            holdTimer = setTimeout(() => {
                isLongPress = true;
                btn.innerText = 'RELOADING...';
                btn.style.fontSize = '12px'; // Smaller text for reload
                window.location.reload();
            }, 1000);
        };

        const endHold = () => {
            btn.style.backgroundColor = '#ff8800'; // Reset color
            if (holdTimer) {
                clearTimeout(holdTimer);
                holdTimer = null;
            }

            if (!isLongPress) {
                // Restore font size if it was changed
                btn.style.fontSize = '20px';

                // Toggle Pause
                if (this.scene.isPaused()) {
                    this.scene.resume();
                    btn.innerText = '⏸';
                    this.physics.resume(); // Ensure physics resumes
                    if (this.isDebug) {
                        this.closeDebugModal();
                    }
                } else {
                    if (this.isDebug) {
                        this.openDebugModal(); // Will set isPaused=true
                        btn.innerText = '⚙';
                    } else {
                        // Normal Pause
                        this.scene.pause();
                        btn.innerText = '▶';
                        this.physics.pause();
                    }
                }
            }
        };

        btn.addEventListener('mousedown', startHold);
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); startHold(); });

        btn.addEventListener('mouseup', endHold);
        btn.addEventListener('mouseleave', endHold);
        btn.addEventListener('touchend', endHold);

        document.body.appendChild(btn);
    }

    createUpgradeUI() {
        // Ensure Pause Button is hidden or effectively disabled during upgrade UI? 
        // Or just let it be. It has zIndex 1000. Upgrade UI has 1000. 
        // Let's make Upgrade UI 2000 to be on top.

        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.top = '50%';
        div.style.left = '50%';
        div.style.transform = 'translate(-50%, -50%)';
        div.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
        div.style.padding = '30px';
        div.style.borderRadius = '15px';
        div.style.color = 'white';
        div.style.fontFamily = 'Arial, sans-serif';
        div.style.textAlign = 'center';
        div.style.zIndex = '2000'; // Increased z-index
        div.style.border = '2px solid white';
        div.id = 'upgrade-ui';

        const title = document.createElement('h2');
        title.innerText = 'CHOOSE UPGRADE';
        title.style.margin = '0 0 20px 0';
        div.appendChild(title);

        const maxLevel = GameConfig.Upgrades.MaxLevel;

        const btn = document.createElement('button');
        const currentLvl = this.weaponLevels['SHOTGUN'] || 0;

        if (currentLvl >= maxLevel) {
            btn.innerText = 'SHOTGUN MAXED';
            btn.disabled = true;
            btn.style.backgroundColor = '#555555';
            btn.style.cursor = 'default';
        } else {
            btn.innerText = currentLvl === 0 ? 'UNLOCK SHOTGUN' : `UPGRADE SHOTGUN (LVL ${currentLvl + 1})`;
            btn.style.backgroundColor = '#ff0000';
            btn.style.cursor = 'pointer';
            btn.onmouseover = () => btn.style.backgroundColor = '#ff4444';
            btn.onmouseout = () => btn.style.backgroundColor = '#ff0000';
            btn.onclick = () => {
                this.selectUpgrade('SHOTGUN');
                document.body.removeChild(div);
            };
        }

        btn.style.padding = '15px 30px';
        btn.style.fontSize = '20px';
        btn.style.fontWeight = 'bold';
        btn.style.color = 'white';
        btn.style.border = 'none';
        btn.style.borderRadius = '5px';
        div.appendChild(btn);

        const btnHoming = document.createElement('button');
        const homingLvl = this.weaponLevels['HOMING'] || 0;

        if (homingLvl >= maxLevel) {
            btnHoming.innerText = 'HOMING MAXED';
            btnHoming.disabled = true;
            btnHoming.style.backgroundColor = '#555555';
            btnHoming.style.cursor = 'default';
        } else {
            btnHoming.innerText = homingLvl === 0 ? 'UNLOCK HOMING' : `UPGRADE HOMING (LVL ${homingLvl + 1})`;
            btnHoming.style.backgroundColor = '#0000ff';
            btnHoming.style.cursor = 'pointer';
            btnHoming.onmouseover = () => btnHoming.style.backgroundColor = '#4444ff';
            btnHoming.onmouseout = () => btnHoming.style.backgroundColor = '#0000ff';
            btnHoming.onclick = () => {
                this.selectUpgrade('HOMING');
                document.body.removeChild(div);
            };
        }

        btnHoming.style.padding = '15px 30px';
        btnHoming.style.fontSize = '20px';
        btnHoming.style.fontWeight = 'bold';
        btnHoming.style.color = 'white';
        btnHoming.style.border = 'none';
        btnHoming.style.borderRadius = '5px';
        btnHoming.style.marginTop = '10px';
        btnHoming.style.display = 'block'; // New line
        btnHoming.style.width = '100%';
        div.appendChild(btnHoming);

        const btnRedwall = document.createElement('button');
        const redwallLvl = this.passiveLevels['REDWALL_HURT_LESS'] || 0;

        if (redwallLvl >= maxLevel) {
            btnRedwall.innerText = 'REDWALL RESIST MAXED';
            btnRedwall.disabled = true;
            btnRedwall.style.backgroundColor = '#555555';
            btnRedwall.style.cursor = 'default';
        } else {
            const nextReduct = (GameConfig.Passives.REDWALL_HURT_LESS.baseReduction + (redwallLvl) * GameConfig.Passives.REDWALL_HURT_LESS.reductionPerLevel) * 100;
            btnRedwall.innerText = redwallLvl === 0 ? `LESS HURT (${nextReduct}%)` : `UPGRADE RESIST (${nextReduct}%)`;
            btnRedwall.style.backgroundColor = '#880000';
            btnRedwall.style.cursor = 'pointer';
            btnRedwall.onmouseover = () => btnRedwall.style.backgroundColor = '#aa2222';
            btnRedwall.onmouseout = () => btnRedwall.style.backgroundColor = '#880000';
            btnRedwall.onclick = () => {
                this.selectUpgrade('REDWALL_HURT_LESS');
                document.body.removeChild(div);
            };
        }

        btnRedwall.style.padding = '15px 30px';
        btnRedwall.style.fontSize = '20px';
        btnRedwall.style.fontWeight = 'bold';
        btnRedwall.style.color = 'white';
        btnRedwall.style.border = 'none';
        btnRedwall.style.borderRadius = '5px';
        btnRedwall.style.marginTop = '10px';
        btnRedwall.style.display = 'block';
        btnRedwall.style.width = '100%';
        btnRedwall.style.width = '100%';
        div.appendChild(btnRedwall);

        const btnYellow = document.createElement('button');
        const yellowLvl = this.passiveLevels['YELLOW_OBSTACLE_HEAL'] || 0;

        if (yellowLvl >= maxLevel) {
            btnYellow.innerText = 'HEAL UPGRADE MAXED';
            btnYellow.disabled = true;
            btnYellow.style.backgroundColor = '#555555';
            btnYellow.style.cursor = 'default';
        } else {
            const nextHeal = (GameConfig.Passives.YELLOW_OBSTACLE_HEAL.baseHeal + (yellowLvl) * GameConfig.Passives.YELLOW_OBSTACLE_HEAL.healPerLevel) * 100;
            btnYellow.innerText = yellowLvl === 0 ? `Y. OBSTACLE HEAL (${nextHeal}%)` : `UPGRADE HEAL (${nextHeal}%)`;
            btnYellow.style.backgroundColor = '#ddaa00'; // Gold/Yellow ish
            btnYellow.style.cursor = 'pointer';
            btnYellow.onmouseover = () => btnYellow.style.backgroundColor = '#ffcc00';
            btnYellow.onmouseout = () => btnYellow.style.backgroundColor = '#ddaa00';
            btnYellow.onclick = () => {
                this.selectUpgrade('YELLOW_OBSTACLE_HEAL');
                document.body.removeChild(div);
            };
        }

        btnYellow.style.padding = '15px 30px';
        btnYellow.style.fontSize = '20px';
        btnYellow.style.fontWeight = 'bold';
        btnYellow.style.color = 'black'; // Black text for contrast on yellow
        btnYellow.style.border = 'none';
        btnYellow.style.borderRadius = '5px';
        btnYellow.style.marginTop = '10px';
        btnYellow.style.display = 'block';
        btnYellow.style.width = '100%';
        div.appendChild(btnYellow);

        document.body.appendChild(div);
    }

    selectUpgrade(type) {
        if (type === 'HOMING') {
            // Secondary Weapon - Just upgrade level
            if (this.weaponLevels[type] !== undefined) {
                this.weaponLevels[type]++;
            } else {
                this.weaponLevels[type] = 1;
            }
        } else if (type === 'REDWALL_HURT_LESS' || type === 'YELLOW_OBSTACLE_HEAL') {
            // Passive
            if (this.passiveLevels[type] !== undefined) {
                this.passiveLevels[type]++;
            } else {
                this.passiveLevels[type] = 1;
            }
        } else {
            // Primary Weapon Switching
            this.currentWeapon = type;
            if (this.weaponLevels[type] !== undefined) {
                this.weaponLevels[type]++;
            } else {
                this.weaponLevels[type] = 1;
            }
        }

        // Stats Update
        this.totalUpgradesCount++;
        this.currentKillProgress = 0; // Reset progress for next tier

        let lvl = this.weaponLevels[type] || this.passiveLevels[type];
        console.log(`Upgraded ${type} to Level ${lvl}`);

        // Resume time
        this.tweens.add({
            targets: this,
            slowMoFactor: 1,
            duration: 1000,
            ease: 'Linear'
        });
    }
    // --- DEBUG UI ---

    createDebugUI() {
        if (!this.isDebug) return;

        const style = { fontSize: '14px', fontFamily: 'monospace', fill: '#00ff00', backgroundColor: '#000000aa' };
        this.debugText = this.add.text(10, 10, 'DEBUG', style).setScrollFactor(0).setDepth(1000); // UI Layer

        // Open Modal Button - REMOVED (Now triggered by Pause Button)
        // const btnBg = this.add.rectangle(this.width - 40, 40, 60, 40, 0x444444).setScrollFactor(0).setDepth(1000).setInteractive();
        // const btnTxt = this.add.text(this.width - 40, 40, 'MENU', { fontSize: '12px', fill: '#00ff00' }).setOrigin(0.5).setScrollFactor(0).setDepth(1000);
        // btnBg.on('pointerdown', () => this.openDebugModal());

        // Keep keyboard hidden or active? Remove hints only.
    }

    openDebugModal() {
        if (this.debugModalOpen) return;
        this.debugModalOpen = true;

        // Pause Game Logic (Freeze Time)
        this.physics.world.pause();
        this.isPaused = true;

        // Container
        const modal = this.add.container(this.width / 2, this.height / 2).setScrollFactor(0).setDepth(2000);
        this.debugModal = modal;

        // Background
        const bg = this.add.rectangle(0, 0, this.width * 0.8, this.height * 0.6, 0x000000, 0.9).setInteractive(); // Block clicks
        modal.add(bg);

        // Title
        const title = this.add.text(0, -this.height * 0.25, 'DEBUG MENU', { fontSize: '24px', fill: '#ffffff', stroke: '#00aa00', strokeThickness: 4 }).setOrigin(0.5);
        modal.add(title);

        // Buttons
        const createBtn = (y, text, color, callback) => {
            const b = this.add.container(0, y);
            const r = this.add.rectangle(0, 0, 200, 40, color).setInteractive();
            const t = this.add.text(0, 0, text, { fontSize: '16px', fill: '#ffffff' }).setOrigin(0.5);
            b.add([r, t]);

            r.on('pointerdown', () => {
                // Feedback
                r.setAlpha(0.5);
                this.time.delayedCall(100, () => r.setAlpha(1));
                callback();
            });
            return b;
        };

        let yy = -100;
        const gap = 50;

        // BOSS
        modal.add(createBtn(yy, 'SPAWN BOSS', 0xaa0000, () => {
            this.phaseManager.nextBossThreshold = this.distance + 10;
            console.log('DEBUG: Boss Scheduled');
            this.closeDebugModal();
        }));
        yy += gap;

        // CHALLENGE
        modal.add(createBtn(yy, 'FORCE CHALLENGE', 0xaa5500, () => {
            this.phaseManager.forcePhase('CHALLENGE', 'GATES');
            console.log('DEBUG: Challenge Started');
            this.closeDebugModal();
        }));
        yy += gap;

        // KILL ALL
        modal.add(createBtn(yy, 'KILL ALL ENEMIES', 0x550000, () => {
            this.flyingEnemies.forEach(e => {
                this.handleEnemyDeath(e.type);
                if (e.visuals) e.visuals.destroy();
                if (e.body) this.matter.world.remove(e.body);
            });
            this.flyingEnemies = [];
            this.closeDebugModal();
        }));
        yy += gap;

        // HEAL
        modal.add(createBtn(yy, 'FULL HEAL', 0x00aa00, () => {
            this.playerHealth = this.playerMaxHealth;
            this.updateHealthUI();
            this.closeDebugModal();
        }));
        yy += gap;

        // INVINCIBILITY Toggle
        const invColor = this.debugInvincible ? 0x005500 : 0x555555;
        const invText = this.debugInvincible ? 'GOD MODE: ON' : 'GOD MODE: OFF';

        modal.add(createBtn(yy, invText, invColor, () => {
            this.debugInvincible = !this.debugInvincible;
            if (this.debugInvincible) this.playerVisual.setAlpha(0.5);
            else this.playerVisual.setAlpha(1);
            this.closeDebugModal(); // Re-open to update text? Or just close.
        }));
        yy += gap;

        // CLOSE
        modal.add(createBtn(yy + 20, 'CLOSE', 0x333333, () => {
            this.closeDebugModal();
        }));
    }

    closeDebugModal() {
        if (this.debugModal) {
            this.debugModal.destroy();
            this.debugModal = null;
        }
        this.debugModalOpen = false;

        // Resume
        this.physics.world.resume();
        this.isPaused = false;
    }

    updateDebugUI() {
        if (!this.debugText) return;
        const phase = this.phaseManager.currentPhase;
        const pattern = this.phaseManager.activePattern;
        const enemies = this.flyingEnemies.length;
        const chunk = this.chunkCount;

        this.debugText.setText(
            `Ph: ${phase} | Pat: ${pattern} | Dist: ${this.distance} | En: ${enemies} | Chk: ${chunk} | Inv: ${this.debugInvincible}`
        );
    }

    playDamageEffect() {
        // Stop existing damage tween if any
        if (this.damageTween) {
            this.damageTween.stop();
            this.playerVisual.clearTint();
            this.playerVisual.setAlpha(1);
        }

        // Flash Red
        this.damageTween = this.tweens.add({
            targets: this.playerVisual,
            duration: 100, // Fast pulse
            alpha: 1,      // Keep fully visible (solid red)
            yoyo: true,
            repeat: 1,
            onStart: () => this.playerVisual.setTint(0xff0000),
            onComplete: () => {
                this.playerVisual.clearTint();
                this.playerVisual.setAlpha(1); // Ensure reset
                this.damageTween = null;
            }
        });
    }
}
