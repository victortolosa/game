import Phaser from 'phaser';
import MainScene from './scenes/MainScene?v=2';
import MenuScene from './scenes/MenuScene';
import GameOverScene from './scenes/GameOverScene';
import './style.css';

const config = {
  type: Phaser.AUTO,
  scale: {
    mode: Phaser.Scale.RESIZE,
    parent: 'app',
    width: window.innerWidth,
    height: window.innerHeight,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { y: 1 },
      debug: false // Disable debug to use custom visuals
    }
  },
  scene: [MenuScene, MainScene, GameOverScene]
};

const game = new Phaser.Game(config);
