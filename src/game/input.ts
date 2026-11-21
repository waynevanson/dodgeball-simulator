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

/** Keyboard, mouse and touch input, normalised into a single query surface. */
export class Input {
  private readonly canvas: HTMLCanvasElement;
  private readonly keys = new Set<string>();
  private readonly pressedKeys = new Set<string>();
  private readonly touchActions = new Set<TouchAction>();

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

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.usingTouch =
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

    this.bindKeyboard();
    this.bindMouse();
    this.bindTouch();

    if (this.usingTouch) document.body.classList.add('touch-mode');
  }

  isDown(...codes: string[]): boolean {
    return codes.some((code) => this.keys.has(code));
  }

  pressed(code: string): boolean {
    return this.pressedKeys.has(code);
  }

  takeTouchAction(action: TouchAction): boolean {
    if (!this.touchActions.has(action)) return false;
    this.touchActions.delete(action);
    return true;
  }

  /** Clear one-shot state; called at the end of every rendered frame. */
  endFrame(): void {
    this.pressedKeys.clear();
    this.mouse.rightPressed = false;
    this.touchActions.clear();
  }

  private enableTouchMode(): void {
    this.usingTouch = true;
    document.body.classList.add('touch-mode');
  }

  // ---------------------------------------------------------------- keyboard

  private bindKeyboard(): void {
    const block = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab']);

    window.addEventListener('keydown', (e) => {
      const onButton = e.target instanceof HTMLButtonElement;
      if (block.has(e.code) && !(onButton && e.code === 'Space')) e.preventDefault();
      if (!e.repeat) this.pressedKeys.add(e.code);
      this.keys.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.left = false;
      this.mouse.right = false;
    });
  }

  // ------------------------------------------------------------------- mouse

  private bindMouse(): void {
    const map = (e: PointerEvent): void => {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * VIEW_W;
        this.mouse.y = ((e.clientY - rect.top) / rect.height) * VIEW_H;
      }
      this.mouse.used = true;
      this.usingTouch = false;
      // Hide the on-screen controls again on a device with a precise mouse.
      if (!window.matchMedia('(pointer: coarse)').matches) {
        document.body.classList.remove('touch-mode');
      }
    };

    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      map(e);
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      map(e);
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) {
        this.mouse.right = true;
        this.mouse.rightPressed = true;
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ------------------------------------------------------------------- touch

  private bindTouch(): void {
    this.bindStick();
    this.bindThrowButton();
    this.bindTouchActionButton('btn-dash', 'dash');
    this.bindTouchActionButton('btn-catch', 'catch');

    window.addEventListener(
      'touchstart',
      () => {
        if (!this.usingTouch) this.enableTouchMode();
      },
      { passive: true },
    );
  }

  private bindStick(): void {
    const stick = document.getElementById('stick');
    const knob = document.getElementById('stick-knob');
    if (!stick || !knob) return;

    let active: number | null = null;
    let cx = 0;
    let cy = 0;
    let radius = 1;

    const setKnob = (x: number, y: number): void => {
      knob.style.transform = `translate(${x}px, ${y}px)`;
    };

    const move = (e: PointerEvent): void => {
      if (e.pointerId !== active) return;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > radius) {
        dx = (dx / len) * radius;
        dy = (dy / len) * radius;
      }
      setKnob(dx, dy);
      if (Math.hypot(dx, dy) < 6) {
        this.touch.mx = 0;
        this.touch.my = 0;
      } else {
        this.touch.mx = dx / radius;
        this.touch.my = dy / radius;
      }
    };

    const end = (e: PointerEvent): void => {
      if (e.pointerId !== active) return;
      active = null;
      this.touch.mx = 0;
      this.touch.my = 0;
      setKnob(0, 0);
    };

    stick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const rect = stick.getBoundingClientRect();
      cx = rect.left + rect.width / 2;
      cy = rect.top + rect.height / 2;
      radius = Math.max(20, rect.width * 0.34);
      active = e.pointerId;
      try {
        stick.setPointerCapture(e.pointerId);
      } catch {
        /* pointer capture is best-effort */
      }
      this.enableTouchMode();
      move(e);
    });
    stick.addEventListener('pointermove', move);
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
    stick.addEventListener('lostpointercapture', end);
  }

  private bindThrowButton(): void {
    const btn = document.getElementById('btn-throw');
    if (!btn) return;
    const up = (): void => {
      this.touch.throwDown = false;
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.enableTouchMode();
      // Capture keeps the charge alive if the thumb slides off the button.
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        /* best-effort */
      }
      this.touch.throwDown = true;
    });
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
  }

  private bindTouchActionButton(id: string, action: TouchAction): void {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.enableTouchMode();
      this.touchActions.add(action);
    });
  }
}
