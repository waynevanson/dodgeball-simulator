import styles from './shell.module.css';
import {
  BLUE_LINEUP,
  CUSTOM_SLOT,
  DEFAULT_CUSTOM_NAME,
  DIFFICULTY_ORDER,
  PLAYER_NAME_MAX,
} from '../game/constants';
import type { DifficultyId, Score } from '../game/types';

export type ScreenName = 'menu' | 'pause' | 'results' | 'rules' | null;

const DIFFICULTY_LABELS: Record<DifficultyId, string> = {
  rookie: 'Rookie',
  pro: 'Pro',
  allstar: 'All-Star',
};

const q = <T extends Element>(root: ParentNode, selector: string): T => {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Shell: missing element for "${selector}"`);
  return node;
};

/**
 * Imperative DOM shell for the menus and on-screen controls. Screens are pure
 * presentation; all game flow lives in the XState machine, wired up by the
 * callbacks below.
 */
export class Shell {
  private readonly screens: Record<'menu' | 'pause' | 'results' | 'rules', HTMLElement>;
  private readonly diffButtons: HTMLButtonElement[];
  private readonly lineupButtons: HTMLButtonElement[];
  private readonly customInput: HTMLInputElement;
  private readonly soundIcon: HTMLElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly titleEl: HTMLElement;
  private readonly scoreEl: HTMLElement;
  private readonly subEl: HTMLElement;
  private readonly kickerEl: HTMLElement;

  difficulty: DifficultyId = 'pro';
  playerSlot = CUSTOM_SLOT;
  customName = '';
  onStart: (() => void) | null = null;
  onResume: (() => void) | null = null;
  onRestart: (() => void) | null = null;
  onMenu: (() => void) | null = null;
  onPause: (() => void) | null = null;
  onFullscreen: (() => void) | null = null;
  onSoundToggle: (() => void) | null = null;
  onDifficulty: ((difficulty: DifficultyId) => void) | null = null;
  onLineup: ((slot: number, customName: string) => void) | null = null;

  constructor() {
    const app = document.getElementById('app');
    if (!app) throw new Error('Shell: #app not found');

    const ui = document.createElement('div');
    ui.id = 'ui';
    ui.innerHTML = `
      <section class="${styles.screen}" data-screen="menu">
        <div class="${styles.panel}">
          <div class="${styles.panelInner}">
          <h1 class="${styles.brand}">
            <span class="${styles.brandMain}">DODGE<span class="${styles.brandBall}">BALL</span></span>
            <span class="${styles.brandSub}">SIMULATOR</span>
          </h1>
          <p class="${styles.tagline}">
            Six a side. Six balls on the centre line. One hit and you're out.<br />
            Catch a live ball to send the thrower out and bring a teammate back in.
          </p>

          <div class="${styles.diff}" role="group" aria-label="Difficulty">
            ${DIFFICULTY_ORDER.map(
              (id) =>
                `<button type="button" class="${styles.diffBtn}" data-difficulty="${id}">${DIFFICULTY_LABELS[id]}</button>`,
            ).join('')}
          </div>

          <div class="${styles.lineup}" role="group" aria-label="Choose your player">
            <p class="${styles.lineupLabel}">PLAY AS</p>
            <div class="${styles.lineupBtns}">
              ${BLUE_LINEUP.map(
                (entry, index) =>
                  `<button type="button" class="${styles.lineupBtn}" data-lineup="${index}">${entry.name}</button>`,
              ).join('')}
            </div>
            <label class="${styles.nameField}">
              <span class="${styles.nameLabel}">CUSTOM PLAYER NAME</span>
              <input
                class="${styles.nameInput}"
                data-custom-name
                type="text"
                maxlength="${PLAYER_NAME_MAX}"
                autocomplete="off"
                spellcheck="false"
                placeholder="${DEFAULT_CUSTOM_NAME}"
              />
            </label>
            <p class="${styles.nameHint}">Type your own name for the sixth player, or leave it blank for Crispy.</p>
          </div>

          <button class="${styles.cta}" data-play type="button">PLAY BALL</button>
          <p class="${styles.rulesHint}">
            <button class="${styles.linkBtn}" data-rules type="button">Read the rules</button>
            &mdash; VDL / WDBF Foam format
          </p>

          <div class="${styles.keys}">
            <div class="${styles.keyRow}">
              <span class="${styles.keysK}"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span>
              <span class="${styles.keysV}">Move</span>
            </div>
            <div class="${styles.keyRow}">
              <span class="${styles.keysK}"><kbd>Mouse</kbd></span>
              <span class="${styles.keysV}">Aim</span>
            </div>
            <div class="${styles.keyRow}">
              <span class="${styles.keysK}"><kbd>Hold&nbsp;LMB</kbd></span>
              <span class="${styles.keysV}">Charge &amp; throw</span>
            </div>
            <div class="${styles.keyRow}">
              <span class="${styles.keysK}"><kbd>Shift</kbd></span>
              <span class="${styles.keysV}">Dash</span>
            </div>
            <div class="${styles.keyRow}">
              <span class="${styles.keysK}"><kbd>Space</kbd><kbd>RMB</kbd></span>
              <span class="${styles.keysV}">Catch / block</span>
            </div>
            <div class="${styles.keyRow}">
              <span class="${styles.keysK}"><kbd>Esc</kbd></span>
              <span class="${styles.keysV}">Pause</span>
            </div>
          </div>

          <p class="${styles.mobileHint}">
            Stick to move &middot; hold THROW to charge &middot; DASH &middot; CATCH
          </p>

          <p class="${styles.note}">
            First to 3 sets wins. Grab a ball in the opening rush and carry it behind the
            attack line to arm it. Empty hands catch; a ball in hand blocks. Don't cross the
            centre line and don't hold the ball for 10 seconds.
          </p>
          </div>
        </div>
      </section>

      <section class="${styles.screen} ${styles.hidden}" data-screen="pause">
        <div class="${styles.panel} ${styles.panelSmall}">
          <div class="${styles.panelInner}">
          <p class="${styles.kicker}">Time out</p>
          <h2 class="${styles.panelTitle} ${styles.panelTitleSm}">PAUSED</h2>
          <div class="${styles.actions}">
            <button class="${styles.cta}" data-resume type="button">RESUME</button>
            <button class="${styles.ghost}" data-restart type="button">RESTART MATCH</button>
            <button class="${styles.ghost}" data-menu type="button">MAIN MENU</button>
          </div>
          <p class="${styles.note}">Press <kbd>Esc</kbd> to get back in.</p>
          </div>
        </div>
      </section>

      <section class="${styles.screen} ${styles.hidden}" data-screen="results">
        <div class="${styles.panel} ${styles.panelSmall}">
          <div class="${styles.panelInner}">
          <p class="${styles.kicker}" data-result-kicker>Final whistle</p>
          <h2 class="${styles.panelTitle}" data-result-title>VICTORY</h2>
          <p class="${styles.resultScore}" data-result-score>3 &ndash; 1</p>
          <p class="${styles.tagline} ${styles.taglineTight}" data-result-sub>Blue team takes the series.</p>
          <div class="${styles.actions}">
            <button class="${styles.cta}" data-again type="button">PLAY AGAIN</button>
            <button class="${styles.ghost}" data-results-menu type="button">MAIN MENU</button>
          </div>
          </div>
        </div>
      </section>

      <section class="${styles.screen} ${styles.hidden}" data-screen="rules">
        <div class="${styles.panel} ${styles.panelWide}">
          <div class="${styles.panelInner}">
          <p class="${styles.kicker}">Dodgeball Victoria &middot; WDBF</p>
          <h2 class="${styles.panelTitle} ${styles.panelTitleSm}">RULES</h2>
          <p class="${styles.rulesIntro}">
            Foam Playing Format, implemented as a 6v6 arcade simulation.
          </p>
          <ul class="${styles.rulesList}">
            <li><strong>Six balls, three per team.</strong> They start on the centre line, 1.5m apart (Rule 12).</li>
            <li><strong>Opening rush.</strong> Everyone starts on the back line. Sprint in, take your three balls, and get out (Rule 13). You may touch the centre line only during the rush.</li>
            <li><strong>Arm your ball.</strong> A ball picked up in the rush must fully cross the 3m attack line before it can get anyone out (Rule 13.7.1).</li>
            <li><strong>A hit is an out.</strong> A live, armed ball that touches any part of a player eliminates them (Rule 19).</li>
            <li><strong>Catch = thrower out.</strong> Catch a live ball and the thrower is eliminated; your first queued teammate re-enters over the back line (Rules 23.4, 25).</li>
            <li><strong>Catching is for empty hands.</strong> With a ball in hand your timed press is a block: the ball deflects and stays live (Rule 21.2).</li>
            <li><strong>Ball advantage.</strong> The team holding the advantage has 10 seconds to make an attempt. Fail and every ball they hold is forfeited to the other team (Rule 17.3).</li>
            <li><strong>Stay in your half.</strong> Crossing the centre line is out of bounds (Rule 26.5); out players queue behind their back line.</li>
            <li><strong>Simultaneous all-out voids the set</strong> and it is replayed with no point (Rule 29.3.2).</li>
            <li><strong>Sets.</strong> Eliminate the whole opposition to win a set. First to 3 sets wins the match (Rule 10).</li>
            <li><strong>Sudden death.</strong> After two minutes of set time, blocking is no longer in effect (Rule 9.7.1).</li>
          </ul>
          <p class="${styles.rulesNote}">
            Not modelled: uniforms, cards, timeouts, ball retrievers, referees and other
            administrative rules. Missed throws are logged as warnings rather than outs,
            matching the referee's discretion in Rule 16.3.
          </p>
          <div class="${styles.actions}">
            <a
              class="${styles.ghost}"
              href="https://www.dodgeballvictoria.com.au/rules"
              target="_blank"
              rel="noopener noreferrer"
            >READ THE OFFICIAL RULES</a>
            <button class="${styles.cta}" data-rules-back type="button">GOT IT</button>
          </div>
          </div>
        </div>
      </section>

    `;
    app.append(ui);

    const topControls = document.createElement('div');
    topControls.className = styles.topControls;
    topControls.innerHTML = `
      <button class="${styles.iconBtn} ${styles.pauseBtn}" data-pause type="button" aria-label="Pause" title="Pause (Esc)" hidden>
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          <rect x="6.5" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" />
          <rect x="13.9" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" />
        </svg>
      </button>
      <button class="${styles.iconBtn}" data-fullscreen type="button" aria-label="Toggle fullscreen" title="Fullscreen">
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9" />
          <path d="M20 9V5.5A1.5 1.5 0 0 0 18.5 4H15" />
          <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20H9" />
          <path d="M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15" />
        </svg>
      </button>
      <button class="${styles.iconBtn}" data-sound-button type="button" aria-label="Mute sound" title="Mute (M)">
        <span data-sound-icon aria-hidden="true">\u{1F50A}</span>
      </button>
    `;
    app.append(topControls);

    const rotate = document.createElement('div');
    rotate.className = styles.rotateOverlay;
    rotate.innerHTML = `
      <div class="${styles.rotateCard}">
        <div class="${styles.rotatePhone}" aria-hidden="true"></div>
        <h2 class="${styles.rotateTitle}">ROTATE YOUR PHONE</h2>
        <p class="${styles.rotateText}">
          Dodgeball needs a wide court. Turn your phone sideways for the full arena.
        </p>
        <button class="${styles.ghost}" data-portrait-ok type="button">PLAY ANYWAY</button>
      </div>
    `;
    app.append(rotate);

    const touch = document.createElement('div');
    touch.id = 'touch';
    touch.setAttribute('aria-hidden', 'true');
    touch.innerHTML = `
      <div id="stick" class="${styles.stick}"><div id="stick-knob" class="${styles.stickKnob}"></div></div>
      <div class="${styles.touchBtns}">
        <button id="btn-catch" class="${styles.tbtn} ${styles.tbtnSmall} ${styles.btnCatch}" type="button">CATCH</button>
        <button id="btn-dash" class="${styles.tbtn} ${styles.tbtnSmall} ${styles.btnDash}" type="button">DASH</button>
        <button id="btn-throw" class="${styles.tbtn} ${styles.tbtnBig}" type="button">THROW</button>
      </div>
    `;
    app.append(touch);

    this.screens = {
      menu: q(ui, '[data-screen="menu"]'),
      pause: q(ui, '[data-screen="pause"]'),
      results: q(ui, '[data-screen="results"]'),
      rules: q(ui, '[data-screen="rules"]'),
    };
    this.diffButtons = [...ui.querySelectorAll<HTMLButtonElement>('[data-difficulty]')];
    this.lineupButtons = [...ui.querySelectorAll<HTMLButtonElement>('[data-lineup]')];
    this.customInput = q<HTMLInputElement>(ui, '[data-custom-name]');
    this.soundIcon = q(topControls, '[data-sound-icon]');
    this.pauseBtn = q(topControls, '[data-pause]');
    this.titleEl = q(ui, '[data-result-title]');
    this.scoreEl = q(ui, '[data-result-score]');
    this.subEl = q(ui, '[data-result-sub]');
    this.kickerEl = q(ui, '[data-result-kicker]');

    q<HTMLButtonElement>(ui, '[data-play]').addEventListener('click', () => this.onStart?.());
    q<HTMLButtonElement>(ui, '[data-again]').addEventListener('click', () => this.onStart?.());
    q<HTMLButtonElement>(ui, '[data-resume]').addEventListener('click', () => this.onResume?.());
    q<HTMLButtonElement>(ui, '[data-restart]').addEventListener('click', () => this.onRestart?.());
    q<HTMLButtonElement>(ui, '[data-menu]').addEventListener('click', () => this.onMenu?.());
    q<HTMLButtonElement>(ui, '[data-results-menu]').addEventListener('click', () =>
      this.onMenu?.(),
    );
    q<HTMLButtonElement>(ui, '[data-rules]').addEventListener('click', () =>
      this.showScreen('rules'),
    );
    q<HTMLButtonElement>(ui, '[data-rules-back]').addEventListener('click', () =>
      this.showScreen('menu'),
    );
    q<HTMLButtonElement>(rotate, '[data-portrait-ok]').addEventListener('click', () => {
      document.body.classList.add('portrait-ok');
    });

    this.pauseBtn.addEventListener('click', () => this.onPause?.());
    q<HTMLButtonElement>(topControls, '[data-fullscreen]').addEventListener('click', () =>
      this.onFullscreen?.(),
    );
    q<HTMLButtonElement>(topControls, '[data-sound-button]').addEventListener('click', () =>
      this.onSoundToggle?.(),
    );

    for (const btn of this.diffButtons) {
      btn.addEventListener('click', () => {
        const id = btn.dataset.difficulty as DifficultyId | undefined;
        if (!id || !DIFFICULTY_ORDER.includes(id)) return;
        this.setDifficulty(id);
        this.onDifficulty?.(id);
      });
    }

    for (const btn of this.lineupButtons) {
      btn.addEventListener('click', () => {
        const slot = Number(btn.dataset.lineup);
        if (!Number.isInteger(slot) || slot < 0 || slot >= BLUE_LINEUP.length) return;
        this.setLineup(slot, this.customName);
        this.onLineup?.(this.playerSlot, this.customName);
      });
    }

    this.customInput.addEventListener('input', () => {
      this.customName = this.customInput.value.slice(0, PLAYER_NAME_MAX);
      if (this.customInput.value !== this.customName) this.customInput.value = this.customName;
      this.setLineup(CUSTOM_SLOT, this.customName);
      this.onLineup?.(this.playerSlot, this.customName);
    });

    this.setDifficulty(this.difficulty);
    this.setLineup(this.playerSlot, this.customName);
    this.setMuted(false);
  }

  setLineup(slot: number, customName: string): void {
    const requested = Number.isFinite(slot) ? Math.floor(slot) : CUSTOM_SLOT;
    this.playerSlot = Math.min(BLUE_LINEUP.length - 1, Math.max(0, requested));
    this.customName = customName.slice(0, PLAYER_NAME_MAX);
    this.refreshLineup();
  }

  private refreshLineup(): void {
    for (const btn of this.lineupButtons) {
      const slot = Number(btn.dataset.lineup);
      const fallback = slot === CUSTOM_SLOT ? DEFAULT_CUSTOM_NAME : BLUE_LINEUP[slot]?.name;
      const label = slot === CUSTOM_SLOT ? this.customName.trim() || DEFAULT_CUSTOM_NAME : fallback;
      btn.textContent = label || DEFAULT_CUSTOM_NAME;
      btn.classList.toggle(styles.isActive, slot === this.playerSlot);
      btn.setAttribute('aria-pressed', slot === this.playerSlot ? 'true' : 'false');
    }
    if (this.customInput.value !== this.customName) this.customInput.value = this.customName;
  }

  showScreen(name: ScreenName): void {
    for (const [key, node] of Object.entries(this.screens)) {
      node.classList.toggle(styles.hidden, key !== name);
    }
  }

  /** Shows on-screen controls and the pause button only while a set is live. */
  setPlaying(playing: boolean): void {
    document.body.classList.toggle('playing', playing);
    this.pauseBtn.hidden = !playing;
  }

  setDifficulty(difficulty: DifficultyId): void {
    this.difficulty = difficulty;
    for (const btn of this.diffButtons) {
      btn.classList.toggle(styles.isActive, btn.dataset.difficulty === difficulty);
    }
  }

  setMuted(muted: boolean): void {
    this.soundIcon.textContent = muted ? '\u{1F507}' : '\u{1F50A}';
    this.soundIcon.parentElement?.classList.toggle(styles.isMuted, muted);
    const button = this.soundIcon.parentElement;
    button?.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
  }

  showResults(win: boolean, score: Score, difficulty: DifficultyId): void {
    this.titleEl.textContent = win ? 'VICTORY' : 'DEFEAT';
    this.titleEl.className = `${styles.panelTitle} ${win ? styles.win : styles.lose}`;
    this.scoreEl.textContent = `${score.blue} \u2013 ${score.red}`;
    this.subEl.textContent = win
      ? 'Blue team takes the series. Nice dodging.'
      : 'Red team takes the series. Run it back?';
    this.kickerEl.textContent = `First to 3 sets \u00b7 ${DIFFICULTY_LABELS[difficulty]}`;
    this.showScreen('results');
  }
}
