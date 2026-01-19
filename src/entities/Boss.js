import Phaser from 'phaser';

export class Boss {
    constructor(scene) {
        this.scene = scene;

        // Configuration
        this.config = {
            width: 80,
            height: 80,
            shieldRadius: 60,
            speed: 1.5,
            hp: 50,
            shieldHits: 10,
            patterns: ['SPIRAL']
        };
    }

    spawn(y) {
        const x = this.scene.scale.width / 2; // Center spawn

        // Boss Body
        const boss = this.scene.matter.add.image(x, y, null, null, {
            isStatic: true,
            isSensor: true,
            label: 'flying_enemy', // Keeping legacy label for collision compatibility
            shape: 'circle',
            radius: this.config.width / 2
        });

        // Visuals Container
        const visuals = this.scene.add.container(x, y);

        // Boss Sprite - "UFO Saucer"
        const saucer = this.scene.add.ellipse(0, 0, 120, 50, 0x222222);
        saucer.setStrokeStyle(3, 0x00ff00); // Neon Green rim
        visuals.add(saucer);

        // Dome
        const dome = this.scene.add.circle(0, -10, 35, 0x660066); // Dark Purple Dome
        dome.setStrokeStyle(2, 0xff00ff);
        visuals.add(dome);

        // Inner Eye (Red)
        const eyeGfx = this.scene.add.circle(0, -15, 12, 0xff0000);
        eyeGfx.setStrokeStyle(2, 0xffaaaa);
        visuals.add(eyeGfx);

        // Shield Visual
        const shieldGfx = this.scene.add.graphics();
        visuals.add(shieldGfx);

        // Shield Update Function
        const updateShieldVisual = (currentShield) => {
            shieldGfx.clear();
            if (currentShield <= 0) return;

            const percentage = currentShield / this.config.shieldHits;
            const color = Phaser.Display.Color.Interpolate.ColorWithColor(
                Phaser.Display.Color.ValueToColor(0x00ffff),
                Phaser.Display.Color.ValueToColor(0x0000ff),
                100, percentage * 100
            );

            shieldGfx.lineStyle(4, color.color, 1);
            shieldGfx.strokeEllipse(0, 0, 140, 70);
        };

        // Health Bar
        const healthBarBg = this.scene.add.rectangle(0, -60, 80, 10, 0x000000);
        const healthBarFill = this.scene.add.rectangle(0, -60, 78, 8, 0xff0000);
        healthBarFill.setOrigin(0, 0.5);
        healthBarFill.x = -39;
        visuals.add(healthBarBg);
        visuals.add(healthBarFill);

        // Data Structure
        const enemyData = {
            type: 'boss',
            body: boss,
            visuals: visuals,
            shieldGfx: shieldGfx,
            updateShield: updateShieldVisual,
            healthBarFill: healthBarFill,
            maxHealth: this.config.hp,
            health: this.config.hp,
            shieldMax: this.config.shieldHits,
            shieldHealth: this.config.shieldHits,
            shieldActive: true,

            // AI State
            currentPattern: 'SPIRAL',
            patternTimer: 0,
            attackTimer: 0,
            spiralAngle: 0,

            // Spawn Info
            initialX: x,
            initialY: y
        };

        // Initialize Shield
        updateShieldVisual(enemyData.shieldHealth);

        // Link Data
        boss.setData('enemyData', enemyData);

        console.log('BOSS SPAWNED (Class)!');
        return enemyData;
    }

    update(bossData, dt, camY) {
        if (!bossData || !bossData.body) return;

        // Check if boss has entered screen
        // Boss spawnY is usually center of chunk. We wait until it's "on screen"
        const screenBottom = camY + this.scene.scale.height;
        // If boss is way below screen, keep it frozen relative to wall (implicit via static body?)
        // Actually, static body stays at world coordinates. We need to check if it's visible.

        if (!bossData.hasEntered) {
            if (bossData.body.y < screenBottom + 100) {
                bossData.hasEntered = true;
                console.log('BOSS ENTERED SCREEN');
            } else {
                // Not yet entered, do nothing (let it scroll up with the wall chunk)
                // NOTE: Since it's a static body, it stays at Y.
                // The camera scrolls down (camY increases).
                // So relative to camera, the boss moves UP.
                // Eventually body.y < screenBottom.
                return;
            }
        }

        // 1. Movement: Camera Relative
        // We want the boss to stay at a fixed relative position on the screen
        const targetRelativeY = this.scene.scale.height - 200; // 200px from bottom

        if (!bossData.currentRelativeY) {
            // First run, initialize relative position based on current spawn
            bossData.currentRelativeY = bossData.body.y - camY;
        }

        // Smoothly move relative Y to target
        bossData.currentRelativeY = Phaser.Math.Interpolation.Linear(
            [bossData.currentRelativeY, targetRelativeY],
            0.0125 * dt / 16 // Reduced to 0.0125 (Very slow)
        );

        // Absolute Position = Camera Y + Relative Y
        // Also lerp X to player
        const targetX = this.scene.player.x;
        const currentX = bossData.body.x;
        const lerpX = Phaser.Math.Interpolation.Linear([currentX, targetX], 0.005 * dt / 16); // Reduced to 0.005

        bossData.body.setPosition(lerpX, camY + bossData.currentRelativeY);
        bossData.visuals.setPosition(lerpX, camY + bossData.currentRelativeY);

        // 2. AI Patterns
        bossData.patternTimer += dt;
        bossData.attackTimer -= dt;

        // Cycle Patterns: 5s Attack + 3s Break = 8s Cycle
        if (bossData.patternTimer > 8000) {
            bossData.patternTimer = 0;
            const patterns = this.config.patterns;
            bossData.currentPattern = patterns[Phaser.Math.Between(0, patterns.length - 1)];
            console.log('Boss Pattern:', bossData.currentPattern);
        }

        // 3. Shooting - Only during first 5 seconds (Attack Phase)
        // AND check if boss is actually on screen (arrived)
        const isOnScreen = bossData.body.y < camY + this.scene.scale.height + 100;
        const isAttackPhase = bossData.patternTimer <= 5000;

        if (isOnScreen && isAttackPhase && bossData.attackTimer <= 0) {
            this.shoot(bossData);

            // Set next fire time (Increased delays for spacing)
            if (bossData.currentPattern === 'BURST') {
                bossData.attackTimer = 350; // Was 200
            } else if (bossData.currentPattern === 'SPIRAL') {
                bossData.attackTimer = 700; // Was 350 (Reduced by 50%)
            } else {
                bossData.attackTimer = 1500; // Was 1000
            }
        }
    }

    shoot(bossData) {
        // Visual Feedback: Flash Eye
        if (bossData.visuals && bossData.visuals.list.length > 2) {
            const eye = bossData.visuals.list[2];
            eye.fillColor = 0xffffff;
            this.scene.time.delayedCall(50, () => {
                if (bossData.body && bossData.body.gameObject && bossData.body.gameObject.active) {
                    eye.fillColor = 0xff0000;
                }
            });
        }

        const pattern = bossData.currentPattern;
        const startX = bossData.body.x;
        const startY = bossData.body.y;

        if (pattern === 'BURST') {
            // TARGETED STREAM
            const angle = Phaser.Math.Angle.Between(startX, startY, this.scene.player.x, this.scene.player.y);
            const spread = Phaser.Math.FloatBetween(-0.05, 0.05);
            // Speed 3.8 -> 1.9 (50% reduction)
            this.scene.createEnemyProjectile(startX, startY, angle + spread, 1.9, 0xFF4500);

        } else if (pattern === 'SPREAD') {
            // EXPANDING RING
            const count = 6;
            const step = (Math.PI * 2) / count;

            for (let i = 0; i < count; i++) {
                const angle = i * step + bossData.spiralAngle;
                // Speed 2.55 -> 1.25 (50% reduction)
                this.scene.createEnemyProjectile(startX, startY, angle, 1.25, 0x00FFFF);
            }
            bossData.spiralAngle += 0.1;

        } else if (pattern === 'SPIRAL') {
            // MULTI-ARM SPIRAL
            const arms = 2; // Increased to 2
            bossData.spiralAngle += 0.2;

            for (let i = 0; i < arms; i++) {
                const angle = bossData.spiralAngle + (i * (Math.PI * 2 / arms));
                // Speed 3.0 -> 1.5 (50% reduction)
                this.scene.createEnemyProjectile(startX, startY, angle, 1.5, 0x39FF14);
            }
        }
    }
}
