import { VIEW_H, VIEW_W } from './constants';

export interface MouseState {
  x: number;
  y: number;
  left: boolean;
  right: boolean;
  rightPressed: boolean;
  used: boolean;
}

export interface TouchState {
  mx: number;
  my: number;
  throwDown: boolean;
}

export type TouchAction = 'dash' | 'catch';

/** One pointer sample, already mapped into the 1280x720 logical space. */
export interface PointerSample {
  id: number;
  x: number;
  y: number;
  button: number;
  pointerType: string;
}

/**
 * Raw device state: keyboard, mouse and pointer samples. It knows nothing about
 * the game or the UI — systems interpret it. Every pointer press is a sample
 * rather than a DOM callback so canvas hit-testing can decide what it meant.
 */
export class Input {
  readonly #canvas: HTMLCanvasElement;
  readonly #keys = new Set<string>();
  readonly #pressedKeys = new Set<string>();
  readonly #touchActions = new Set<TouchAction>();

  readonly mouse: MouseState = {
    x: VIEW_W / 2,
    y: VIEW_H / 2,
    left: false,
    right: false,
    rightPressed: false,
    used: false,
  };

  readonly touch: TouchState = { mx: 0, my: 0, throwDown: false };
  usingTouch: boolean;

  /** Pointer presses/releases/moves since the last `endFrame`. */
  readonly pointerDowns: PointerSample[] = [];
  readonly pointerUps: PointerSample[] = [];
  readonly pointerMoves: PointerSample[] = [];

  /** Printable characters typed since the last `endFrame`. */
  readonly typed: string[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.#canvas = canvas;
    this.usingTouch =
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

    this.#bindKeyboard();
    this.#bindPointer();
  }

  isDown(...codes: string[]): boolean {
    return codes.some((code) => this.#keys.has(code));
  }

  pressed(code: string): boolean {
    return this.#pressedKeys.has(code);
  }

  takeTouchAction(action: TouchAction): boolean {
    if (!this.#touchActions.has(action)) return false;
    this.#touchActions.delete(action);
    return true;
  }

  addTouchAction(action: TouchAction): void {
    this.#touchActions.add(action);
  }

  /** Snapshot the slice of device state the Rust simulation consumes. */
  snapshot(): InputFrame {
    return {
      up: this.isDown('KeyW', 'ArrowUp'),
      down: this.isDown('KeyS', 'ArrowDown'),
      left: this.isDown('KeyA', 'ArrowLeft'),
      right: this.isDown('KeyD', 'ArrowRight'),
      mouseX: this.mouse.x,
      mouseY: this.mouse.y,
      mouseUsed: this.mouse.used,
      leftDown: this.mouse.left,
      rightPressed: this.mouse.rightPressed,
      dash: this.pressed('ShiftLeft') || this.pressed('ShiftRight'),
      catch: this.pressed('Space') || this.pressed('KeyE'),
      touch: this.usingTouch,
      touchMx: this.touch.mx,
      touchMy: this.touch.my,
      throwDown: this.touch.throwDown,
      touchDash: this.takeTouchAction('dash'),
      touchCatch: this.takeTouchAction('catch'),
    };
  }

  /** Clear one-shot state; called at the end of every rendered frame. */
  endFrame(): void {
    this.#pressedKeys.clear();
    this.mouse.rightPressed = false;
    this.#touchActions.clear();
    this.pointerDowns.length = 0;
    this.pointerUps.length = 0;
    this.pointerMoves.length = 0;
    this.typed.length = 0;
  }

  #toCanvas(e: PointerEvent): { x: number; y: number } {
    const rect = this.#canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
    return {
      x: ((e.clientX - rect.left) / rect.width) * VIEW_W,
      y: ((e.clientY - rect.top) / rect.height) * VIEW_H,
    };
  }

  #sample(e: PointerEvent): PointerSample {
    const { x, y } = this.#toCanvas(e);
    return { id: e.pointerId, x, y, button: e.button, pointerType: e.pointerType };
  }

  // ---------------------------------------------------------------- keyboard

  #bindKeyboard(): void {
    const block = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab']);

    window.addEventListener('keydown', (e) => {
      if (block.has(e.code)) e.preventDefault();
      if (!e.repeat) this.#pressedKeys.add(e.code);
      this.#keys.add(e.code);
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
        this.typed.push(e.key);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.#keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.#keys.clear();
      this.mouse.left = false;
      this.mouse.right = false;
    });
  }

  // ----------------------------------------------------------------- pointer

  #bindPointer(): void {
    this.#canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.#canvas.addEventListener('pointerdown', (e) => {
      const sample = this.#sample(e);
      this.pointerDowns.push(sample);
      if (e.pointerType === 'touch') {
        this.#enableTouchMode();
        return;
      }
      this.mouse.x = sample.x;
      this.mouse.y = sample.y;
      this.mouse.used = true;
      this.usingTouch = false;
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) {
        this.mouse.right = true;
        this.mouse.rightPressed = true;
      }
    });

    // Moves are tracked on the window so a thumb can slide off the canvas.
    window.addEventListener('pointermove', (e) => {
      const sample = this.#sample(e);
      this.pointerMoves.push(sample);
      if (e.pointerType === 'touch') return;
      this.mouse.x = sample.x;
      this.mouse.y = sample.y;
      this.mouse.used = true;
      if (!window.matchMedia('(pointer: coarse)').matches) this.usingTouch = false;
    });

    const release = (e: PointerEvent): void => {
      this.pointerUps.push(this.#sample(e));
      if (e.pointerType === 'touch') return;
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    };

    // Listen on the window so a thumb or mouse released off-canvas still ends.
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
  }

  #enableTouchMode(): void {
    this.usingTouch = true;
  }
}

/** One frame of device state in the shape `crates/sim` expects. */
export interface InputFrame {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  mouseX: number;
  mouseY: number;
  mouseUsed: boolean;
  leftDown: boolean;
  rightPressed: boolean;
  dash: boolean;
  catch: boolean;
  touch: boolean;
  touchMx: number;
  touchMy: number;
  throwDown: boolean;
  touchDash: boolean;
  touchCatch: boolean;
}
