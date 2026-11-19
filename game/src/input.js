// Keyboard and mouse state, read by the game loop each frame. Keys are tracked by their
// physical codes (KeyW, ArrowUp, ...) so the controls work on any keyboard layout, and the
// mouse is tracked in world coordinates through the camera the main loop hands in.

export const Input = {
  keys: new Set(),
  pressed: new Set(), // codes that went down this frame, cleared by the loop after use
  mouseScreen: { x: 0, y: 0 },
  mouseDown: false,
  mouseClicked: false, // went down this frame
  enabled: true, // menus turn this off so the world does not answer behind them

  attach(canvas) {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseScreen.x = ((e.clientX - rect.left) / rect.width) * canvas.width;
      this.mouseScreen.y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.mouseClicked = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  },

  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  },

  justPressed(...codes) {
    return codes.some((c) => this.pressed.has(c));
  },

  // Movement axes from the keys: x -1..1 (A/D and arrows), y -1..1 (W/S and arrows).
  axes() {
    let x = 0;
    let y = 0;
    if (this.down('KeyA', 'ArrowLeft')) x -= 1;
    if (this.down('KeyD', 'ArrowRight')) x += 1;
    if (this.down('KeyW', 'ArrowUp')) y -= 1;
    if (this.down('KeyS', 'ArrowDown')) y += 1;
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    return { x, y };
  },

  endFrame() {
    this.pressed.clear();
    this.mouseClicked = false;
  },
};
