import Phaser from 'phaser';
import EnemySystem from './EnemySystem';

export default class RoundManager {
    private scene: Phaser.Scene;
    private enemySystem: EnemySystem;
    private onRoundInfoChange: (round: number, timeRemaining: number, isWaiting: boolean) => void;

    private currentRound: number = 0;
    private state: 'PLAYING' | 'WAITING' = 'WAITING';

    // Enemy Count State
    private totalEnemiesForRound: number = 0;
    private enemiesRemoved: number = 0;

    constructor(
        scene: Phaser.Scene,
        enemySystem: EnemySystem,
        onRoundInfoChange: (round: number, timeRemaining: number, isWaiting: boolean) => void
    ) {
        this.scene = scene;
        this.enemySystem = enemySystem;
        this.onRoundInfoChange = onRoundInfoChange;
    }

    public start() {
        this.currentRound = 0;
        this.startWaiting();
    }

    private startWaiting() {
        this.state = 'WAITING';
        console.log(`Round Finished. Waiting for start...`);

        // Stop Spawning (just in case)
        this.enemySystem.stop();

        // Notify UI (Enemies 0 means waiting)
        this.onRoundInfoChange(this.currentRound, 0, true);
    }

    public startNextRound() {
        if (this.state === 'PLAYING') return;

        this.currentRound++;
        this.state = 'PLAYING';
        this.enemiesRemoved = 0;

        // Calc Logic
        // Base enemies 5. Increase by 2 each round. 
        this.totalEnemiesForRound = 5 + ((this.currentRound - 1) * 2);

        console.log(`Starting Round ${this.currentRound} with ${this.totalEnemiesForRound} enemies`);

        // Calc Difficulty
        // Base delay 2000, min 500. Reduce by 150 each round.
        const delay = Math.max(500, 2000 - ((this.currentRound - 1) * 150));

        // Base speed 1.0. Increase by 0.1 each round.
        const speedMult = 1.0 + ((this.currentRound - 1) * 0.1);

        // Apply Difficulty & Start Wave
        this.enemySystem.setDifficulty(delay, speedMult);
        this.enemySystem.startWave(this.totalEnemiesForRound, () => this.handleEnemyRemoved());

        // Notify UI
        this.updateUI();
    }

    private handleEnemyRemoved() {
        if (this.state !== 'PLAYING') return;

        this.enemiesRemoved++;
        this.updateUI();

        if (this.enemiesRemoved >= this.totalEnemiesForRound) {
            this.startWaiting();
        }
    }

    private updateUI() {
        const remaining = this.totalEnemiesForRound - this.enemiesRemoved;
        // We pass 'remaining' as the 2nd arg, replacing 'timeRemaining'
        this.onRoundInfoChange(this.currentRound, remaining, false);
    }

    public update(_time: number, _delta: number) {
        // No longer need per-frame update for timer
    }

    public shutdown() {
        // Cleanup if needed
        this.enemySystem.stop();
    }
}
