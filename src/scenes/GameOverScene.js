import Phaser from 'phaser';
import { GameConfig } from '../GameConfig';

export default class GameOverScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameOverScene' });
    }

    init(data) {
        this.finalDistance = data.distance || 0;
    }

    create() {
        this.width = this.scale.width;
        this.height = this.scale.height;

        // Background (Slightly Red/Dark)
        this.cameras.main.setBackgroundColor('#220000');

        // YOU DIED Text
        // YOU DIED Text
        this.add.text(this.width / 2, this.height * 0.3, 'YOU DIED', {
            fontSize: '54px',
            fontFamily: GameConfig.UI.FontFamily,
            fill: '#ff0000',
            stroke: '#000000',
            strokeThickness: 8
        }).setOrigin(0.5);

        // Distance Text
        // Distance Text
        this.add.text(this.width / 2, this.height * 0.45, `YOU FELL ${this.finalDistance} METERS`, {
            fontSize: '27px',
            fontFamily: GameConfig.UI.FontFamily,
            fill: '#ffffff'
        }).setOrigin(0.5);

        // Restart Button
        const button = this.add.container(this.width / 2, this.height * 0.65);
        const btnBg = this.add.rectangle(0, 0, 240, 60, 0xffffff).setInteractive();
        const btnText = this.add.text(0, 0, 'RESTART', {
            fontSize: '20px',
            fontFamily: GameConfig.UI.FontFamily,
            fill: '#ff0000'
        }).setOrigin(0.5);
        button.add([btnBg, btnText]);

        // Hover Effects
        btnBg.on('pointerover', () => {
            btnBg.setFillStyle(0xdddddd);
            btnText.setScale(1.1);
        });
        btnBg.on('pointerout', () => {
            btnBg.setFillStyle(0xffffff);
            btnText.setScale(1);
        });
        btnBg.on('pointerdown', () => {
            this.scene.start('MainScene');
        });

        // Add a back to menu option?
        const menuText = this.add.text(this.width / 2, this.height * 0.8, 'BACK TO MENU', {
            fontSize: '15px',
            fill: '#888888',
            fontFamily: GameConfig.UI.FontFamily
        }).setOrigin(0.5).setInteractive();

        menuText.on('pointerdown', () => {
            this.scene.start('MenuScene');
        });
        menuText.on('pointerover', () => menuText.setFillStyle('#ffffff'));
        menuText.on('pointerout', () => menuText.setFillStyle('#888888'));
    }
}
