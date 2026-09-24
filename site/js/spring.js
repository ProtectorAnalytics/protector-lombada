/**
 * spring.js — física de interface no estilo Apple (WWDC "Designing Fluid
 * Interfaces"), em JS puro, para site/, dashboard/ e admin/.
 *
 * Carregado no browser via <script src="/js/spring.js"> (window.Spring) e
 * testado no Node via require (test/spring.test.js). UMD, como camera-status.js.
 *
 * Por que molas e não transition/@keyframes: uma mola parte do valor ATUAL na
 * tela, herda a velocidade do dedo e pode ser redirecionada a qualquer instante
 * sem salto. Parâmetros no vocabulário da Apple:
 *   damping  1.0 = sem overshoot (padrão); ~0.8 só depois de gesto com impulso
 *   response segundos até "chegar" (não é duração fixa)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Spring = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = { damping: 1, response: 0.4 };
  const SNAPPY = { damping: 1, response: 0.3 };      // menus, popovers
  const MOMENTUM = { damping: 0.8, response: 0.3 };  // sheet/drawer após flick
  const REST_DELTA = 0.01;      // px
  const REST_VELOCITY = 0.5;    // px/s
  const MAX_SUBSTEP = 1 / 240;  // s — integração estável mesmo em 30 fps
  const VELOCITY_WINDOW_MS = 100;
  const DRAG_THRESHOLD = 10;    // px de histerese antes de assumir o gesto

  /** Um passo de integração (semi-implícito de Euler), massa 1. Função pura. */
  function step(state, target, dt, params) {
    const p = params || DEFAULTS;
    const stiffness = Math.pow((2 * Math.PI) / p.response, 2);
    const damping = (4 * Math.PI * p.damping) / p.response;
    let { value, velocity } = state;
    let remaining = dt;
    while (remaining > 0) {
      const h = Math.min(remaining, MAX_SUBSTEP);
      const accel = -stiffness * (value - target) - damping * velocity;
      velocity += accel * h;
      value += velocity * h;
      remaining -= h;
    }
    return { value, velocity };
  }

  function isSettled(state, target) {
    return Math.abs(state.value - target) < REST_DELTA
      && Math.abs(state.velocity) < REST_VELOCITY;
  }

  /** Onde um gesto lançado vai parar (fórmula da Apple, decaimento exponencial). */
  function project(velocity, decelerationRate = 0.998) {
    return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
  }

  /** Resistência progressiva além de um limite; nunca ultrapassa `dimension`. */
  function rubberband(overshoot, dimension, constant = 0.55) {
    const sign = Math.sign(overshoot);
    const x = Math.abs(overshoot);
    return sign * ((x * dimension * constant) / (dimension + constant * x));
  }

  /** Mede a velocidade (px/s) pelos pontos dos últimos ~100 ms. */
  function velocityTracker() {
    let points = [];
    return {
      add(position, time) {
        points.push({ position, time });
        const cutoff = time - VELOCITY_WINDOW_MS;
        points = points.filter((pt) => pt.time >= cutoff);
      },
      velocity() {
        if (points.length < 2) return 0;
        const first = points[0];
        const last = points[points.length - 1];
        const dt = last.time - first.time;
        return dt > 0 ? ((last.position - first.position) / dt) * 1000 : 0;
      },
      reset() { points = []; },
    };
  }

  function prefersReducedMotion() {
    return typeof matchMedia === 'function'
      && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Animador interrompível de UM valor. `set()` redireciona a partir do valor e
   * da velocidade atuais — é isso que evita o "salto" ao interromper.
   */
  function create(options) {
    const opts = Object.assign({ value: 0 }, options);
    let state = { value: opts.value, velocity: 0 };
    let target = opts.value;
    let params = { damping: opts.damping ?? DEFAULTS.damping, response: opts.response ?? DEFAULTS.response };
    let frame = null;
    let lastTime = 0;
    let onRest = null;

    function emit() { if (opts.onUpdate) opts.onUpdate(state.value); }

    function finish() {
      frame = null;
      const cb = onRest;
      onRest = null;
      if (cb) cb();
    }

    function tick(now) {
      const dt = Math.min((now - lastTime) / 1000, 0.064);
      lastTime = now;
      state = step(state, target, dt, params);
      if (isSettled(state, target)) {
        state = { value: target, velocity: 0 };
        emit();
        return finish();
      }
      emit();
      frame = requestAnimationFrame(tick);
    }

    return {
      get value() { return state.value; },
      get velocity() { return state.velocity; },
      get isAnimating() { return frame !== null; },
      get target() { return target; },
      /** Anima até `to`; `velocity` em px/s herda o gesto. */
      set(to, setOpts) {
        const o = setOpts || {};
        target = to;
        if (o.damping !== undefined || o.response !== undefined) {
          params = { damping: o.damping ?? params.damping, response: o.response ?? params.response };
        }
        if (o.velocity !== undefined) state = { value: state.value, velocity: o.velocity };
        onRest = o.onRest || null;
        if (prefersReducedMotion() && !o.ignoreReducedMotion) return this.jump(to, onRest);
        // Aba oculta: o navegador congela o requestAnimationFrame e o estado
        // final (ex.: overlay escondido) nunca chegaria. Vai direto.
        if (typeof document !== 'undefined' && document.hidden) return this.jump(to, onRest);
        if (frame === null) {
          lastTime = performance.now();
          frame = requestAnimationFrame(tick);
        }
      },
      /** Vai direto ao valor, sem animar (arrasto 1:1, reduced motion). */
      jump(to, cb) {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        state = { value: to, velocity: 0 };
        target = to;
        emit();
        if (cb) cb();
      },
      stop() {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        onRest = null;
        target = state.value;
      },
    };
  }

  /**
   * Bottom sheet arrastável: segue o dedo 1:1, resiste para cima (rubber-band),
   * e ao soltar projeta o impulso para decidir entre fechar e voltar.
   *   el        — o painel que se move (translateY)
   *   onDismiss — chamado depois que o painel saiu da tela
   *   onProgress(p) — 0 (aberto) → 1 (fechado), para o scrim acompanhar
   * Só arrasta a partir do topo do conteúdo (scrollTop 0), para não brigar
   * com a rolagem interna.
   */
  function sheet(el, config) {
    const cfg = config || {};
    const height = () => el.getBoundingClientRect().height || window.innerHeight;
    const spring = create({
      value: 0,
      onUpdate(y) {
        el.style.transform = `translate3d(0, ${y}px, 0)`;
        if (cfg.onProgress) cfg.onProgress(Math.max(0, Math.min(1, y / height())));
      },
    });
    const tracker = velocityTracker();
    let drag = null;
    let pendingRest = null; // onDismiss de um close() em andamento

    function scrollerAtTop(target) {
      const scroller = target.closest && target.closest('[data-sheet-scroll]');
      return !scroller || scroller.scrollTop <= 0;
    }

    function onDown(e) {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest('input, textarea, select, button, a')) return;
      if (!scrollerAtTop(e.target)) return;
      // Agarra no meio do voo, a partir do valor atual; se for só um toque,
      // onUp retoma o destino e o destino de fechar (onRest) não se perde.
      const resume = spring.isAnimating ? { to: spring.target, onRest: pendingRest } : null;
      spring.stop();
      drag = { id: e.pointerId, startY: e.clientY, origin: spring.value, active: false, resume };
      tracker.reset();
      tracker.add(spring.value, e.timeStamp);
    }

    function onMove(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const dy = e.clientY - drag.startY;
      if (!drag.active) {
        if (Math.abs(dy) < DRAG_THRESHOLD) return;
        if (dy < 0 && drag.origin <= 0) { drag = null; return; } // gesto de rolar para cima
        drag.active = true;
        drag.startY = e.clientY; // sem salto: a histerese não vira deslocamento
        el.setPointerCapture(e.pointerId);
      }
      const raw = drag.origin + (e.clientY - drag.startY);
      const y = raw < 0 ? rubberband(raw, height()) : raw;
      tracker.add(y, e.timeStamp);
      spring.jump(y);
    }

    function onUp(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const { active, resume } = drag;
      drag = null;
      if (!active) {
        if (resume) spring.set(resume.to, Object.assign({ onRest: resume.onRest }, DEFAULTS));
        return;
      }
      const v = tracker.velocity();
      const projected = spring.value + project(v);
      if (projected > height() * 0.5) close({ velocity: v });
      else {
        pendingRest = null; // voltou a abrir: não herda um fechamento anterior
        spring.set(0, Object.assign({ velocity: v }, Math.abs(v) > 300 ? MOMENTUM : DEFAULTS));
      }
    }

    function open() {
      pendingRest = null;
      // Reabrir no meio da descida parte de onde o painel está (sem salto);
      // só a primeira abertura começa de fora da tela.
      if (!spring.isAnimating) spring.jump(height());
      spring.set(0, DEFAULTS);
    }

    function close(o) {
      const velocity = (o && o.velocity) || 0;
      pendingRest = () => { pendingRest = null; if (cfg.onDismiss) cfg.onDismiss(); };
      spring.set(height(), Object.assign({ velocity, onRest: pendingRest }, DEFAULTS));
    }

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);

    return {
      open,
      close,
      reset() { spring.jump(0); el.style.transform = ''; },
      destroy() {
        el.removeEventListener('pointerdown', onDown);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onUp);
      },
    };
  }

  return {
    DEFAULTS,
    SNAPPY,
    MOMENTUM,
    step,
    isSettled,
    project,
    rubberband,
    velocityTracker,
    prefersReducedMotion,
    create,
    sheet,
  };
});
