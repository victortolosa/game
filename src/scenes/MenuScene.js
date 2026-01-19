import Phaser from 'phaser';
import { GameConfig } from '../GameConfig';

export default class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MenuScene' });
    }

    create() {
        this.width = this.scale.width;
        this.height = this.scale.height;

        // Background
        this.cameras.main.setBackgroundColor('#000000');

        // Reload Button (Top Right)
        this.reloadBtn = this.add.text(this.width - 20, 20, 'RELOAD', {
            fontSize: '14px', fill: '#888888', fontFamily: GameConfig.UI.FontFamily, backgroundColor: '#222222', padding: { x: 5, y: 5 }
        }).setOrigin(1, 0).setInteractive();

        this.reloadBtn.on('pointerdown', () => {
            window.location.reload();
        });
        this.reloadBtn.on('pointerover', () => this.reloadBtn.setStyle({ fill: '#ffffff' }));
        this.reloadBtn.on('pointerout', () => this.reloadBtn.setStyle({ fill: '#888888' }));

        // Title
        const title = this.add.text(this.width / 2, this.height * 0.3, 'GUNFALL', {
            fontSize: '68px',
            fontFamily: GameConfig.UI.FontFamily,
            fill: '#ffffff',
            stroke: '#ff0000',
            strokeThickness: 6
        }).setOrigin(0.5);

        // Start Button Container
        const button = this.add.container(this.width / 2, this.height * 0.6);
        const btnBg = this.add.rectangle(0, 0, 240, 60, 0xff0000).setInteractive();
        const btnText = this.add.text(0, 0, 'START MISSION', {
            fontSize: '20px',
            fontFamily: GameConfig.UI.FontFamily,
            fill: '#ffffff'
        }).setOrigin(0.5);
        button.add([btnBg, btnText]);

        // Button Hover Effects
        btnBg.on('pointerover', () => btnBg.setFillStyle(0xff4444));
        btnBg.on('pointerout', () => btnBg.setFillStyle(0xff0000));
        btnBg.on('pointerdown', () => this.startIntro(button, title, debugBtn, false));

        // Debug Button
        const debugBtn = this.add.container(this.width / 2, this.height * 0.7);
        const dbgBg = this.add.rectangle(0, 0, 240, 60, 0x444444).setInteractive();
        const dbgText = this.add.text(0, 0, 'START DEBUG', {
            fontSize: '20px',
            fontFamily: GameConfig.UI.FontFamily,
            fill: '#00ff00'
        }).setOrigin(0.5);
        debugBtn.add([dbgBg, dbgText]);

        dbgBg.on('pointerover', () => dbgBg.setFillStyle(0x666666));
        dbgBg.on('pointerout', () => dbgBg.setFillStyle(0x444444));
        dbgBg.on('pointerdown', () => this.openDebugConfig(button, title, debugBtn));

        // Player Visual Setup (Reused logic from MainScene)
        this.createPlayerVisuals();
        this.player = this.add.image(this.width / 2, this.height * 0.5, 'playerIdle');
        this.player.setScale(2);
        this.player.setVisible(false);

        // Trapdoor/Floor Visual
        this.floorLeft = this.add.rectangle(this.width / 2 - 25, this.height * 0.5 + 40, 50, 10, 0x333333);
        this.floorRight = this.add.rectangle(this.width / 2 + 25, this.height * 0.5 + 40, 50, 10, 0x333333);
        this.floorLeft.setVisible(false);
        this.floorRight.setVisible(false);
    }

    createPlayerVisuals() {
        const pixelSize = 2;
        const P = {
            '.': null, 'X': 0x222222, 'D': 0x666666, 'G': 0xaaaaaa, 'L': 0xeeeeee,
            'd': 0x444444
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
            g.generateTexture(key, 24, 36);
            g.destroy();
        };

        createTex('playerIdle', [
            "....XXXX....", "...XDDDDX...", "..XDDDDDDX..", "..XLLLLLLX..", ".XLLXLLXLLX.", ".XLLLLLLLLX.",
            "..XLLLLLLX..", "...XXXXXX...", "..XDGGGGDX..", ".XDDGGGGDDX.", ".XDGGGGGGDX.", ".XDDGGGGDDX.",
            "..XDDDDDDX..", "..XDDDDDDX..", "..XD.DD.DX..", "..XD.DD.DX..", "..XX.XX.XX..", "..XX....XX.."
        ]);
    }

    startIntro(button, title, debugBtn, debugConfig = null) {
        this.debugConfig = debugConfig;

        // Hide UI
        button.setVisible(false);
        debugBtn.setVisible(false);
        title.setVisible(false);
        if (this.reloadBtn) this.reloadBtn.setVisible(false);

        // Show player and floor
        this.player.setVisible(true);
        this.floorLeft.setVisible(true);
        this.floorRight.setVisible(true);

        // 1. Brief pause/shake?
        this.cameras.main.shake(200, 0.005);

        this.time.delayedCall(500, () => {
            // 2. Open floors
            this.tweens.add({
                targets: this.floorLeft,
                x: this.floorLeft.x - 100,
                alpha: 0,
                duration: 500,
                ease: 'Power2'
            });
            this.tweens.add({
                targets: this.floorRight,
                x: this.floorRight.x + 100,
                alpha: 0,
                duration: 500,
                ease: 'Power2'
            });

            // 3. Fall
            this.tweens.add({
                targets: this.player,
                y: this.height + 100,
                duration: 1000,
                ease: 'Cubic.easeIn',
                onComplete: () => {
                    this.scene.start('MainScene', { debugMode: !!this.debugConfig, config: this.debugConfig });
                }
            });
        });
    }

    openDebugConfig(mainBtn, title, debugBtn) {
        const modal = this.add.container(this.width / 2, this.height / 2).setDepth(1000);

        // BG
        const bg = this.add.rectangle(0, 0, 300, 400, 0x000000, 0.9).setInteractive();
        const border = this.add.rectangle(0, 0, 300, 400).setStrokeStyle(2, 0x00ff00);
        modal.add([bg, border]);

        const settings = {
            godMode: false,
            startBoss: false,
            challenge: false,
            startFullAmmo: true
        };

        // Title
        const txt = this.add.text(0, -170, 'DEBUG SETUP', { fontSize: '20px', fill: '#00ff00', fontFamily: GameConfig.UI.FontFamily }).setOrigin(0.5);
        modal.add(txt);

        let y = -100;
        const gap = 60;

        const createToggle = (label, key) => {
            const c = this.add.container(0, y);
            const t = this.add.text(-100, 0, label, { fontSize: '15px', fill: '#ffffff', fontFamily: GameConfig.UI.FontFamily }).setOrigin(0, 0.5);
            const box = this.add.rectangle(100, 0, 20, 20, 0x333333).setInteractive();
            const check = this.add.text(100, 0, 'X', { fontSize: '15px', fill: '#00ff00', fontFamily: GameConfig.UI.FontFamily }).setOrigin(0.5).setVisible(settings[key]);

            box.on('pointerdown', () => {
                settings[key] = !settings[key];
                check.setVisible(settings[key]);
            });

            c.add([t, box, check]);
            modal.add(c);
            y += gap;
        };

        createToggle('GOD MODE', 'godMode');
        createToggle('BOSS START', 'startBoss');
        createToggle('CHALLENGE', 'challenge');

        // START GAME BUTTON
        const startBtn = this.add.container(0, 150);
        const sBg = this.add.rectangle(0, 0, 260, 50, 0x00aa00).setInteractive();
        const sTxt = this.add.text(0, 0, 'LAUNCH GAME', { fontSize: '17px', fill: '#ffffff', fontFamily: GameConfig.UI.FontFamily, fontWeight: 'bold' }).setOrigin(0.5);
        startBtn.add([sBg, sTxt]);
        modal.add(startBtn);

        sBg.on('pointerdown', () => {
            modal.destroy();
            this.startIntro(mainBtn, title, debugBtn, settings);
        });

        // CANCEL
        const closeBtn = this.add.text(130, -180, 'X', { fontSize: '17px', fill: '#ff0000', fontFamily: GameConfig.UI.FontFamily }).setInteractive();
        closeBtn.on('pointerdown', () => modal.destroy());
        modal.add(closeBtn);
    }
}
