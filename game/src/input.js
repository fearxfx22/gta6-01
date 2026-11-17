// Keyboard + mouse state. The game loop polls keys; edge-triggered presses
// (E, Esc, R) are consumed once via takePressed(). Drag orbits the camera
// and a click fires — the two share the mouse, so dragDistance() tells the
// shooter how far the pointer moved since mousedown: a real click barely
// moves, a camera drag moves a lot. Pointer lock is never required, which
// keeps headless play working too.
export const KEY = { W: 'KeyW', A: 'KeyA', S: 'KeyS', D: 'KeyD' };

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set(); // edge-triggered, consumed by takePressed()
  let dragDX = 0;
  let dragDY = 0;
  let wheel = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let mouseDown = false;
  let dragMoved = 0;

  const onKeyDown = (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    pressed.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  };
  const onKeyUp = (e) => keys.delete(e.code);
  const onMouseDown = (e) => {
    mouseDown = true;
    dragMoved = 0;
    if (e.button === 0) pressed.add('Mouse0');
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  };
  const onMouseMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    dragDX += dx;
    dragDY += dy;
    dragMoved += Math.abs(dx) + Math.abs(dy);
    lastX = e.clientX;
    lastY = e.clientY;
  };
  const onMouseUp = () => {
    mouseDown = false;
    dragging = false;
  };
  const onWheel = (e) => {
    wheel += e.deltaY;
  };
  // Losing focus must not leave a key "held" forever.
  const onBlur = () => {
    keys.clear();
    dragging = false;
    mouseDown = false;
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('blur', onBlur);

  return {
    /** Is this code held right now? */
    down: (code) => keys.has(code),
    /** WASD/arrows as a movement vector {x, z}. */
    axis() {
      let x = 0;
      let z = 0;
      if (keys.has(KEY.W) || keys.has('ArrowUp')) z -= 1;
      if (keys.has(KEY.S) || keys.has('ArrowDown')) z += 1;
      if (keys.has(KEY.A) || keys.has('ArrowLeft')) x -= 1;
      if (keys.has(KEY.D) || keys.has('ArrowRight')) x += 1;
      return { x, z };
    },
    /** All edge-triggered presses since the last call (consumed). */
    takePressed() {
      const out = new Set(pressed);
      pressed.clear();
      return out;
    },
    // Drop stale edge-triggered presses (e.g. keys hit on the title screen
    // before a run starts, so they can't fire an action on the first frame).
    clearPressed() {
      pressed.clear();
    },
    /** Mouse drag delta since the last call (consumed). */
    takeDrag() {
      const d = { dx: dragDX, dy: dragDY };
      dragDX = 0;
      dragDY = 0;
      return d;
    },
    /** Wheel delta since the last call (consumed). */
    takeWheel() {
      const w = wheel;
      wheel = 0;
      return w;
    },
    get mouseDown() {
      return mouseDown;
    },
    // Pixels the pointer moved since mousedown: a real click barely moves,
    // a camera drag moves a lot. Shooting only happens on a near-still hold.
    dragDistance() {
      return dragMoved;
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('blur', onBlur);
    },
  };
}
