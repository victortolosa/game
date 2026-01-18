import Phaser from 'phaser';

export default class ReloadMinigame {
    private scene: Phaser.Scene;
    private container: Phaser.GameObjects.Container;
    private numbers: Phaser.GameObjects.Text[] = [];
    private currentTarget: number = 1;
    private onReloadComplete: () => void;
    private isVisible: boolean = false;

    private currentCount: number = 4;

    constructor(scene: Phaser.Scene, onReloadComplete: () => void) {
        this.scene = scene;
        this.onReloadComplete = onReloadComplete;

        // Container to hold the numbers
        this.container = scene.add.container(0, 0).setVisible(false).setDepth(20); // High depth above player/enemies

        // Initialize 4 text objects (Max supported)
        for (let i = 0; i < 4; i++) {
            const text = scene.add.text(0, 0, '0', {
                fontSize: '48px',
                color: '#ffffff',
                backgroundColor: '#333333',
                padding: { x: 10, y: 10 }
            }).setOrigin(0.5).setInteractive();

            text.on('pointerdown', () => this.handleTap(text));

            this.numbers.push(text);
            this.container.add(text);
        }
    }

    public show(x: number, y: number, count: number = 4) {
        if (this.isVisible) return;

        this.isVisible = true;
        this.currentTarget = 1;
        this.currentCount = count;
        this.container.setPosition(x, y);
        this.container.setVisible(true);

        // Generate numbers 1-count and shuffle them
        const sequence = Array.from({ length: count }, (_, i) => i + 1);
        Phaser.Utils.Array.Shuffle(sequence);

        // Position them in a vertical column
        const spacing = 60;

        // Disable/Hide all first
        this.numbers.forEach(n => n.setVisible(false));

        // Configure active ones
        for (let i = 0; i < count; i++) {
            const text = this.numbers[i];
            const value = sequence[i];

            text.setVisible(true);
            text.setText(value.toString());
            text.setData('value', value);

            // Layout: Vertical column, centered
            // Center around 0
            const totalHeight = (count - 1) * spacing;
            const startY = -totalHeight / 2;
            text.setPosition(0, startY + (i * spacing));

            // Reset style
            text.setColor('#ffffff');
            text.setBackgroundColor('#333333');
            text.setScale(1);
        }

        // Add Keyboard Listener
        if (this.scene.input.keyboard) {
            this.scene.input.keyboard.on('keydown', this.handleKeyDown, this);
        }
    }

    public hide() {
        this.isVisible = false;
        this.container.setVisible(false);
        // Remove Keyboard Listener
        if (this.scene.input.keyboard) {
            this.scene.input.keyboard.off('keydown', this.handleKeyDown, this);
        }
    }

    private handleKeyDown(event: KeyboardEvent) {
        if (!this.isVisible) return;

        const key = event.key;
        const num = parseInt(key, 10);

        if (!isNaN(num)) {
            // Find the text object with this value
            const targetText = this.numbers.find(t => t.visible && t.getData('value') === num);
            if (targetText) {
                this.handleTap(targetText);
            }
        }
    }

    private handleTap(text: Phaser.GameObjects.Text) {
        if (!this.isVisible) return;

        const value = text.getData('value');

        if (value === this.currentTarget) {
            // Correct tap
            text.setColor('#00ff00'); // Turn green
            text.setBackgroundColor('#004400');

            this.currentTarget++;

            if (this.currentTarget > this.currentCount) {
                // Success!
                this.scene.time.delayedCall(200, () => {
                    this.completeRelad();
                });
            }
        } else {
            // Incorrect tap
            // Shake or flash red
            text.setColor('#ff0000');
            this.scene.tweens.add({
                targets: text,
                scaleX: 1.2,
                scaleY: 1.2,
                duration: 50,
                yoyo: true
            });

            // Reset color after delay
            this.scene.time.delayedCall(200, () => {
                if (text.getData('value') >= this.currentTarget) { // Only reset if not already completed (edge case logic)
                    text.setColor('#ffffff');
                }
            });
        }
    }

    private completeRelad() {
        this.hide();
        this.onReloadComplete();
    }

    public isActive(): boolean {
        return this.isVisible;
    }

    public isHit(pointer: Phaser.Input.Pointer): boolean {
        if (!this.isVisible) return false;

        // Check against all visible numbers
        // Since we are using standard input events on text objects, we can check if the pointer is within their bounds?
        // Or simpler: check if the pointer world coordinates intersect with any of the text objects.

        // However, Phaser's input system handles 'pointerdown' on objects separately from the scene 'pointerdown'.
        // If we want to blocking the SCENE pointerdown, we need to know if we clicked a number.

        // Simple AABB check
        const worldPoint = pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2;

        // Note: The numbers are in a container.
        const containerX = this.container.x;
        const containerY = this.container.y;

        for (const text of this.numbers) {
            if (!text.visible) continue;

            // Text local position
            const tx = text.x;
            const ty = text.y;

            // Global-ish position (container + text)
            const gx = containerX + tx;
            const gy = containerY + ty;

            // Get bounds (approximate based on size)
            const width = text.width;
            const height = text.height;

            // Check
            if (worldPoint.x >= gx - width / 2 && worldPoint.x <= gx + width / 2 &&
                worldPoint.y >= gy - height / 2 && worldPoint.y <= gy + height / 2) {
                return true;
            }
        }

        return false;
    }
}
