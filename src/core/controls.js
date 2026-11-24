import * as THREE from 'three';

/**
 * ===========================================================================
 *  CAMERA EM PRIMEIRA PESSOA  —  convencao de jogo
 * ===========================================================================
 *
 *  MAPEAMENTO (o mesmo de qualquer jogo em primeira pessoa)
 *    arrastar bot. esquerdo -> OLHAR em volta (arrastar para a direita vira
 *                              para a direita)
 *    W A S D                -> andar/estrafiar em relacao ao olhar
 *    Shift                  -> correr
 *    Espaco / Ctrl          -> subir / descer
 *    scroll                 -> avanca e recua na direcao do olhar
 *    arrastar bot. direito  -> desloca no plano da tela (pan de CAD)
 *
 *  CONTROLE DE XBOX (Gamepad API, mapeamento padrao do navegador)
 *    analogico esquerdo     -> andar (a inclinacao e a velocidade), sempre no
 *                              plano do chao: olhar para baixo nao mergulha
 *    analogico direito      -> olhar
 *    A duas vezes           -> troca entre VOAR e ANDAR (como no modo criativo
 *                              do Minecraft; Espaco duas vezes faz o mesmo)
 *    voando                 -> A sobe, B ou clique no analogico direito desce
 *                              (RT / LT tambem)
 *    andando                -> gravidade, olhos a ALTURA_OLHOS do piso, A pula,
 *                              Ctrl (ou B) agacha; o mouse trava no centro
 *                              da tela (Esc solta, clique trava)
 *    clique no analogico esq.-> correr
 *    botoes (A, B, X, Y, LB, RB, direcional, Start, View) -> `aoBotao(nome)`,
 *    na borda de descida; quem chama decide o que cada um faz no HUD
 *    (`controls.aoBotao = fn`; `controls.aoControle` avisa o primeiro uso;
 *    `controls.aoModo(andando)` avisa a troca de modo).
 *  Zona morta de 0,15: analogico em repouso nunca e exatamente zero.
 *
 *  ANDAR: o piso e y = 0 ou o topo da caixa de colisao sob os pes (laje de
 *  predio). Degrau de ate DEGRAU sobe sozinho; mais que isso, so voando. A
 *  camera nasce voando, e todo "ir para" (vista, equipamento, passeio) volta
 *  a voar — senao ela cairia do ponto de vista assim que chegasse.
 *
 *  A versao anterior punha o PAN no botao esquerdo. Tecnicamente atendia ao
 *  pedido, mas nao e o que a mao espera: em jogo, arrastar gira a cabeca, nao
 *  translada o corpo. O pan continua existindo, no botao direito.
 *
 *  MOVIMENTO POR VELOCIDADE, nao por posicao: as teclas aplicam aceleracao e a
 *  velocidade sofre atrito. E isso que da o peso e a inercia de jogo, em vez do
 *  deslize uniforme de um "lerp para o alvo".
 *
 *  A camera guarda yaw/pitch proprios em vez de acumular quaternions: evita
 *  gimbal e o rolamento parasita que aparece ao compor rotacoes.
 *
 *  COLISAO (Fase 16): `colisores` e uma lista de caixas {x0..x1, y0..y1,
 *  z0..z1} — paredes, lajes e divisorias dos predios. A camera e uma esfera
 *  de RAIO_CAMERA e anda eixo a eixo: o eixo que entraria numa caixa para, os
 *  outros seguem (escorrega ao longo da parede). O voo ate um ponto de vista
 *  e o "ir para" nao colidem; se a camera ja esta dentro de uma caixa, anda
 *  livre ate sair, em vez de ficar presa.
 */
const RAIO_CAMERA = 0.3;
// Modo andar. [ADOTADO] olhos de um adulto de 1,75 m; a gravidade e o pulo sao
// de jogo, nao de fisica (com 9,81 o pulo parece flutuar). Degrau: o espelho
// de dois degraus de escada.
const ALTURA_OLHOS = 1.7;
const DEGRAU = 0.6;
const TOQUE_DUPLO = 0.35;     // s entre dois toques de A (ou Espaco)
/**
 * A PASSADA, no jeito do Minecraft (convertido de bloco/tick para m/s, com
 * 1 bloco = 1 m e 20 ticks/s). O que da a sensacao dele:
 *  - arranca e para quase seco no chao (atrito 0,546 por tick → 12/s), mas no
 *    ar quase nao ha atrito nem controle (0,91 por tick → 1,9/s): o pulo
 *    correndo leva o embalo, e nao se muda de rumo no meio do salto;
 *  - correr e so 30 % mais rapido, e abre o campo de visao;
 *  - Ctrl agachado: anda devagar e baixa os olhos;
 *  - a cabeca balanca com a distancia andada (nao com o tempo): sobe e desce
 *    duas vezes por ciclo, vai de lado e rola um pouco, e o balanco some suave
 *    ao parar ou sair do chao.
 * [ADOTADO] valores do jogo: andar 4,317 m/s, correr 5,612, agachado 1,295;
 * pulo de 1,25 m (gravidade 32 m/s², 0,08 b/tick²; v0 = raiz(2·32·1,25)).
 */
const PASSADA = {
  velAndar: 4.32,
  fatorCorrida: 1.3,
  fatorAgachado: 0.3,
  atritoChao: 12,             // 1/s
  atritoAr: 1.9,              // 1/s
  gravidade: 32,
  velPulo: 9.4,               // m/s → 1,16 m medido a 60 fps (a integracao por quadro come o resto)
  baixaAgachado: 0.35,        // m que os olhos descem agachado
  fovCorrida: 1.15,           // campo de visao correndo / andando
  passoBalanco: 1.67,         // m por passo (meio ciclo do balanco)
  balancoY: 0.07,             // m — descida da cabeca a cada passo
  balancoX: 0.035,            // m — ida de lado
  balancoRolo: 0.045,         // rad (~2,6°)
  balancoPitch: 0.03,         // rad (~1,7°)
};
const GRAVIDADE = PASSADA.gravidade;
const VEL_PULO = PASSADA.velPulo;
const VEL_ANDAR = PASSADA.velAndar;
export function criarControlesLivres(camera, dom, opts = {}) {
  const {
    alturaMinima = 0.6,
    aceleracao = 62,          // m/s² aplicada pelas teclas
    velocidadeMax = 11,       // m/s andando
    multiplicadorCorrida = 2.6,
    atrito = 9.5,             // 1/s — quanto a velocidade decai sozinha
    sensibilidade = 0.0024,   // rad por pixel
    suavizacaoOlhar = 0.35,   // 0 = instantaneo, 1 = muito mole
  } = opts;

  const LIMITE_PITCH = Math.PI / 2 - 0.02;

  const est = {
    yaw: 0,
    pitch: 0,
    yawAlvo: 0,
    pitchAlvo: 0,
    vel: new THREE.Vector3(),
    arrasto: null,            // 'olhar' | 'pan'
    ultimo: { x: 0, y: 0 },
    teclas: new Set(),
    ativo: true,
    voo: null,                // voo suave ate um ponto de vista
    botoes: [],               // estado anterior dos botoes do controle
    controle: false,          // ja se usou um controle nesta sessao
    colisores: [],
    andando: false,           // false = voando (o modo em que a camera nasce)
    noChao: false,
    toque: -1,                // instante do ultimo toque de A/Espaco (s)
    // passada: o balanco e o campo de visao sao somados por cima da posicao
    // fisica e tirados no quadro seguinte, para a colisao nunca os ver
    fase: 0,                  // distancia andada / passoBalanco
    balanco: 0,               // 0..1, intensidade atual do balanco
    ofs: new THREE.Vector3(), // deslocamento do balanco aplicado agora
    rolo: 0,
    inclina: 0,
    fovExtra: 0,              // graus somados ao fov correndo
    agachado: 0,              // 0..1
  };

  function definirModo(andando) {
    if (est.andando === andando) return;
    est.andando = andando;
    est.noChao = false;
    est.vel.y = 0;
    if (andando) travarMouse(); else soltarMouse();
    api.aoModo?.(andando);
  }

  /* ----------------------------------------------------------------------
   *  Mouse travado no centro (modo andar), como em jogo de tiro: o cursor
   *  some e mexer o mouse vira a cabeca sem arrastar (sem mira, a pedido).
   *  Esc solta (o navegador faz isso sozinho); clique na tela, ainda
   *  andando, trava de novo. O navegador so trava a partir de um gesto
   *  (tecla ou clique): pelo A do controle, o clique seguinte trava.
   * -------------------------------------------------------------------- */
  const travado = () => document.pointerLockElement === dom;
  function travarMouse() {
    if (!est.ativo || travado() || !dom.requestPointerLock) return;
    try { dom.requestPointerLock()?.catch?.(() => {}); } catch { /* sem gesto: o clique trava */ }
  }
  function soltarMouse() { if (travado()) document.exitPointerLock(); }
  document.addEventListener('pointerlockchange', () => {
    est.arrasto = null;
    dom.style.cursor = '';
  });
  document.addEventListener('mousemove', (e) => {
    if (!travado() || !est.ativo) return;
    est.yawAlvo -= e.movementX * sensibilidade;
    est.pitchAlvo = THREE.MathUtils.clamp(est.pitchAlvo - e.movementY * sensibilidade, -LIMITE_PITCH, LIMITE_PITCH);
  });
  /** Toque de A ou Espaco: o segundo dentro de TOQUE_DUPLO troca o modo. */
  function toque() {
    if (!est.ativo || est.voo) return;
    const agora = performance.now() / 1000;
    if (agora - est.toque < TOQUE_DUPLO) { definirModo(!est.andando); est.toque = -1; } else est.toque = agora;
  }

  /** Cota do piso sob a camera: o topo mais alto das caixas sob os pes. No
   *  chao so conta o que esta ate um DEGRAU acima do pe; caindo, tudo o que
   *  ficou abaixo da esfera (pousa-se em cima do que houver). */
  function chaoSob(p) {
    return piso(p.x, p.z, est.noChao ? p.y - ALTURA_OLHOS : p.y - RAIO_CAMERA - DEGRAU);
  }
  /** Cota do piso em (x, z) para quem tem os pes em `yPes`: o topo mais alto
   *  das caixas ate um DEGRAU acima deles (tambem para o companion). */
  function piso(x, z, yPes) {
    let y = 0;
    for (const c of est.colisores) {
      if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1 && c.y1 <= yPes + DEGRAU && c.y1 > y) y = c.y1;
    }
    return y;
  }

  function bate(p) {
    const r = RAIO_CAMERA;
    for (const c of est.colisores) {
      if (p.x > c.x0 - r && p.x < c.x1 + r && p.y > c.y0 - r && p.y < c.y1 + r && p.z > c.z0 - r && p.z < c.z1 + r) return true;
    }
    return false;
  }

  /** Anda `passo`, eixo a eixo, parando no eixo que entraria numa caixa. */
  function andar(passo) {
    const p = camera.position;
    if (!est.colisores.length) { p.add(passo); return; }
    const preso = bate(p);
    for (const eixo of ['x', 'y', 'z']) {
      if (!passo[eixo]) continue;
      p[eixo] += passo[eixo];
      if (!preso && bate(p)) {
        p[eixo] -= passo[eixo];
        est.vel[eixo] = 0;
      }
    }
  }

  const frente = new THREE.Vector3();
  const direita = new THREE.Vector3();
  const cima = new THREE.Vector3();
  const frenteChao = new THREE.Vector3();

  function eixos() {
    frente.set(0, 0, -1).applyQuaternion(camera.quaternion);
    direita.set(1, 0, 0).applyQuaternion(camera.quaternion);
    cima.set(0, 1, 0).applyQuaternion(camera.quaternion);
  }

  function orientarDe(alvo) {
    const d = new THREE.Vector3().subVectors(alvo, camera.position).normalize();
    est.yawAlvo = est.yaw = Math.atan2(-d.x, -d.z);
    est.pitchAlvo = est.pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    aplicar();
  }

  function aplicar() {
    camera.quaternion.setFromEuler(new THREE.Euler(est.pitch + est.inclina, est.yaw, est.rolo, 'YXZ'));
  }

  /** Tira o balanco e o fov da corrida (antes de mover a camera por fora). */
  function tirarPassada() {
    camera.position.sub(est.ofs);
    est.ofs.set(0, 0, 0);
    est.rolo = est.inclina = 0;
    est.balanco = 0;
    if (est.fovExtra) { camera.fov -= est.fovExtra; est.fovExtra = 0; camera.updateProjectionMatrix(); }
  }

  /** Balanco de cabeca e fov da corrida, depois da fisica do quadro. */
  function porPassada(dt, vChao, correndo) {
    const P = PASSADA;
    // intensidade: a velocidade no chao em relacao a de andar; some no ar
    const alvo = est.andando && est.noChao ? Math.min(1.3, vChao / P.velAndar) : 0;
    est.balanco += (alvo - est.balanco) * (1 - Math.exp(-10 * dt));
    if (est.andando && est.noChao) est.fase += (vChao * dt) / P.passoBalanco;
    const b = est.balanco;
    const s = Math.sin(est.fase * Math.PI);
    const c = Math.cos(est.fase * Math.PI);
    // lado: um ciclo a cada dois passos; altura: desce a cada passo
    direita.set(Math.cos(est.yaw), 0, -Math.sin(est.yaw));
    est.ofs.copy(direita).multiplyScalar(s * P.balancoX * b);
    est.ofs.y = -Math.abs(c) * P.balancoY * b - est.agachado * P.baixaAgachado;
    camera.position.add(est.ofs);
    est.rolo = s * P.balancoRolo * b;
    est.inclina = -Math.abs(Math.cos(est.fase * Math.PI - 0.2)) * P.balancoPitch * b;
    // campo de visao: abre correndo, de verdade (embalo acima do de andar)
    const base = camera.fov - est.fovExtra;
    const fracao = est.andando && correndo && vChao > P.velAndar * 0.8 ? 1 : 0;
    const alvoFov = base * (P.fovCorrida - 1) * fracao;
    const novo = est.fovExtra + (alvoFov - est.fovExtra) * (1 - Math.exp(-8 * dt));
    if (Math.abs(novo - est.fovExtra) > 1e-4 || (alvoFov === 0 && est.fovExtra)) {
      est.fovExtra = Math.abs(novo) < 1e-3 && alvoFov === 0 ? 0 : novo;
      camera.fov = base + est.fovExtra;
      camera.updateProjectionMatrix();
    }
    aplicar();
  }

  /* ======================================================================
   *  Mouse
   * =================================================================== */
  dom.addEventListener('contextmenu', (e) => e.preventDefault());

  dom.addEventListener('pointerdown', (e) => {
    est.voo = null;                              // mexeu: o voo para
    if (!est.ativo || travado()) return;
    if (est.andando && e.button === 0) { travarMouse(); return; }
    est.arrasto = e.button === 0 ? 'olhar' : 'pan';
    est.ultimo.x = e.clientX;
    est.ultimo.y = e.clientY;
    dom.setPointerCapture(e.pointerId);
    dom.style.cursor = est.arrasto === 'olhar' ? 'grabbing' : 'move';
  });

  const soltar = (e) => {
    est.arrasto = null;
    dom.style.cursor = '';
    if (e?.pointerId !== undefined && dom.hasPointerCapture?.(e.pointerId)) {
      dom.releasePointerCapture(e.pointerId);
    }
  };
  dom.addEventListener('pointerup', soltar);
  dom.addEventListener('pointercancel', soltar);

  dom.addEventListener('pointermove', (e) => {
    if (!est.arrasto || !est.ativo) return;
    const dx = e.clientX - est.ultimo.x;
    const dy = e.clientY - est.ultimo.y;
    est.ultimo.x = e.clientX;
    est.ultimo.y = e.clientY;

    if (est.arrasto === 'olhar') {
      // dx > 0 (arrastar para a direita) reduz o yaw = vira para a direita,
      // que e a convencao de jogo.
      est.yawAlvo -= dx * sensibilidade;
      est.pitchAlvo = THREE.MathUtils.clamp(
        est.pitchAlvo - dy * sensibilidade, -LIMITE_PITCH, LIMITE_PITCH,
      );
      return;
    }

    eixos();
    const escala = Math.max(1.5, camera.position.y) * 0.0022;
    camera.position.addScaledVector(direita, -dx * escala);
    camera.position.addScaledVector(cima, dy * escala);
  });

  dom.addEventListener('wheel', (e) => {
    if (!est.ativo) return;
    e.preventDefault();
    eixos();
    const passo = THREE.MathUtils.clamp(camera.position.y * 0.3, 0.5, 5);
    camera.position.addScaledVector(frente, -Math.sign(e.deltaY) * passo);
  }, { passive: false });

  /* ======================================================================
   *  Teclado
   * =================================================================== */
  const NAV = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft',
  ]);
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
    if (e.code === 'Space' && !e.repeat) toque();
    if (NAV.has(e.code)) { est.teclas.add(e.code); est.voo = null; e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => est.teclas.delete(e.code));
  window.addEventListener('blur', () => est.teclas.clear());

  /* ======================================================================
   *  Quadro
   * =================================================================== */
  /* ======================================================================
   *  Controle (Gamepad API)
   * =================================================================== */
  const ZONA_MORTA = 0.15;
  const NOMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'view', 'start', 'LS', 'RS',
    'cima', 'baixo', 'esquerda', 'direita'];
  const morta = (v) => (Math.abs(v) < ZONA_MORTA ? 0 : (v - Math.sign(v) * ZONA_MORTA) / (1 - ZONA_MORTA));
  function lerControle() {
    const gp = navigator.getGamepads?.().find((g) => g && g.connected);
    if (!gp) return null;
    const ax = gp.axes;
    const b = gp.buttons;
    const leitura = {
      lx: morta(ax[0] ?? 0), ly: morta(ax[1] ?? 0), rx: morta(ax[2] ?? 0), ry: morta(ax[3] ?? 0),
      sobe: (b[7]?.value ?? 0) - (b[6]?.value ?? 0),
      correr: !!b[10]?.pressed,
      pulo: !!b[0]?.pressed,                       // A: pula (andando) ou sobe (voando)
      desce: !!b[1]?.pressed || !!b[11]?.pressed,  // B ou clique no analogico direito
    };
    b.forEach((bt, i) => {
      const antes = est.botoes[i];
      if (i === 0 && bt.pressed && !antes) toque();
      if (bt.pressed && !antes && NOMES[i] && i !== 6 && i !== 7) api.aoBotao?.(NOMES[i]);
      est.botoes[i] = bt.pressed;
    });
    // so analogico e gatilho interrompem um voo: o botao que PEDIU o voo
    // (LB/RB) nao pode cancela-lo no mesmo quadro
    // (A e B tambem nao: no passeio sao pausa e saida)
    const mexeu = leitura.lx || leitura.ly || leitura.rx || leitura.ry || Math.abs(leitura.sobe) > 0.05;
    if (mexeu) est.voo = null;
    if ((mexeu || b.some((x) => x.pressed)) && !est.controle) { est.controle = true; api.aoControle?.(); }
    return leitura;
  }

  /** Voa ate `posicao` olhando para `olharPara`, em `duracao` s, com entrada e saida suaves. */
  function voarPara(posicao, olharPara, duracao = 1.4) {
    const d = new THREE.Vector3().subVectors(olharPara, posicao).normalize();
    let yaw1 = Math.atan2(-d.x, -d.z);
    while (yaw1 - est.yaw > Math.PI) yaw1 -= Math.PI * 2;      // pelo lado mais curto
    while (yaw1 - est.yaw < -Math.PI) yaw1 += Math.PI * 2;
    definirModo(false);
    est.voo = {
      de: camera.position.clone(), para: posicao.clone(), t: 0, duracao,
      yaw0: est.yaw, pitch0: est.pitch, yaw1, pitch1: Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)),
    };
    est.vel.set(0, 0, 0);
  }

  function update(dt) {
    // a fisica anda sobre a posicao sem o balanco do quadro anterior
    camera.position.sub(est.ofs);
    est.ofs.set(0, 0, 0);
    const r = mover(dt);
    porPassada(dt, r?.vChao ?? 0, !!r?.correndo);
  }

  function mover(dt) {
    const gp = lerControle();
    if (est.voo) {
      tirarPassada();
      const v = est.voo;
      v.t = Math.min(1, v.t + dt / v.duracao);
      const e = v.t < 0.5 ? 4 * v.t ** 3 : 1 - (-2 * v.t + 2) ** 3 / 2;
      camera.position.lerpVectors(v.de, v.para, e);
      est.yaw = est.yawAlvo = v.yaw0 + (v.yaw1 - v.yaw0) * e;
      est.pitch = est.pitchAlvo = v.pitch0 + (v.pitch1 - v.pitch0) * e;
      aplicar();
      if (v.t >= 1) est.voo = null;
      return;
    }
    if (gp && est.ativo) {
      // olhar pelo analogico direito (na vista de planta o norte fica em cima): ~130°/s inclinado ate o fim
      est.yawAlvo -= gp.rx * 2.3 * dt;
      est.pitchAlvo = THREE.MathUtils.clamp(est.pitchAlvo - gp.ry * 1.7 * dt, -LIMITE_PITCH, LIMITE_PITCH);
    }
    // --- olhar: aproxima o angulo do alvo, dando um leve peso ao giro ---
    // com o mouse travado o olhar e direto, como em jogo de tiro
    const k = travado() ? 1 : 1 - Math.pow(suavizacaoOlhar, dt * 60);
    est.yaw += (est.yawAlvo - est.yaw) * k;
    est.pitch += (est.pitchAlvo - est.pitch) * k;
    aplicar();

    // Desativado (vista de planta), o controle so orienta: as teclas continuam
    // sendo registradas, e W com a camera olhando para baixo mergulharia no chao.
    if (!est.ativo) { est.vel.set(0, 0, 0); return; }

    // --- movimento: aceleracao das teclas + atrito ---
    eixos();
    // a frente no plano do chao: a do analogico sempre, e a de tudo ao andar
    frenteChao.set(-Math.sin(est.yaw), 0, -Math.cos(est.yaw));
    const t = est.teclas;
    const dir = new THREE.Vector3();
    const fr = est.andando ? frenteChao : frente;
    if (t.has('KeyW') || t.has('ArrowUp')) dir.add(fr);
    if (t.has('KeyS') || t.has('ArrowDown')) dir.sub(fr);
    if (t.has('KeyD') || t.has('ArrowRight')) dir.add(direita);
    if (t.has('KeyA') || t.has('ArrowLeft')) dir.sub(direita);
    if (t.has('Space') || t.has('KeyE')) dir.y += 1;
    if (t.has('ControlLeft') || t.has('KeyQ')) dir.y -= 1;
    // o analogico soma ao teclado; a inclinacao vira a fracao da velocidade
    let escalaControle = 1;
    if (gp) {
      const plano = new THREE.Vector3().addScaledVector(frenteChao, -gp.ly).addScaledVector(direita, gp.lx);
      plano.y += gp.sobe + (gp.pulo ? 1 : 0) - (gp.desce ? 1 : 0);
      if (plano.lengthSq() > 0 && dir.lengthSq() === 0) escalaControle = Math.min(1, plano.length());
      dir.add(plano);
    }

    const correndo = t.has('ShiftLeft') || t.has('ShiftRight') || !!gp?.correr;

    if (est.andando) {
      // --- andando: so o plano do chao acelera; a vertical e gravidade e pulo ---
      const P = PASSADA;
      const pular = dir.y > 0.5;
      const agachar = dir.y < -0.5;
      est.agachado += ((agachar ? 1 : 0) - est.agachado) * (1 - Math.exp(-14 * dt));
      dir.y = 0;
      let vy = est.vel.y;
      est.vel.y = 0;
      const correr = correndo && !agachar;
      const vMaxChao = VEL_ANDAR * (correr ? P.fatorCorrida : 1) * (agachar ? P.fatorAgachado : 1) * escalaControle;
      // v' = k·(vMax·dir − v): no chao chega ao embalo (e para) em ~0,25 s;
      // no ar k e baixo, entao o salto guarda o embalo e mal muda de rumo
      const k = est.noChao ? P.atritoChao : P.atritoAr;
      const decai = Math.exp(-k * dt);
      if (dir.lengthSq() > 0) dir.normalize();
      const alvo = dir.multiplyScalar(vMaxChao);
      if (!est.noChao && alvo.lengthSq() === 0) alvo.copy(est.vel);   // sem tecla, no ar, nada freia
      est.vel.multiplyScalar(decai).addScaledVector(alvo, 1 - decai);
      if (est.vel.lengthSq() < 1e-6) est.vel.set(0, 0, 0);
      if (pular && est.noChao) { vy = VEL_PULO; est.noChao = false; }
      est.vel.y = vy - GRAVIDADE * dt;
      const vChao = Math.hypot(est.vel.x, est.vel.z);

      andar(est.vel.clone().multiplyScalar(dt));
      const p = camera.position;
      const olhos = chaoSob(p) + ALTURA_OLHOS;
      if (p.y <= olhos && est.vel.y <= 0) {
        // pousa; degrau acima do pe sobe a 8 m/s em vez de saltar de uma vez
        p.y = Math.min(olhos, p.y + 8 * dt);
        est.vel.y = 0;
        est.noChao = true;
      } else est.noChao = false;
      return { vChao, correndo: correr };
    }
    est.agachado = 0;

    const vMax = velocidadeMax * (correndo ? multiplicadorCorrida : 1) * escalaControle;

    if (dir.lengthSq() > 0) {
      dir.normalize();
      est.vel.addScaledVector(dir, aceleracao * (correndo ? multiplicadorCorrida : 1) * dt);
      if (est.vel.length() > vMax) est.vel.setLength(vMax);
    }
    // atrito exponencial: para suave em vez de travar seco
    est.vel.multiplyScalar(Math.exp(-atrito * dt));
    if (est.vel.lengthSq() < 1e-6) est.vel.set(0, 0, 0);

    andar(est.vel.clone().multiplyScalar(dt));
    if (camera.position.y < alturaMinima) {
      camera.position.y = alturaMinima;
      if (est.vel.y < 0) est.vel.y = 0;
    }
  }

  /** Reposiciona a camera olhando para um ponto. */
  function irPara(posicao, olharPara) {
    tirarPassada();
    camera.position.copy(posicao);
    est.voo = null;
    definirModo(false);
    est.vel.set(0, 0, 0);
    orientarDe(olharPara);
  }

  /** Enquadra uma caixa envolvente com afastamento em diagonal. */
  function enquadrarCaixa(caixa, margem = 1.35, direcao = new THREE.Vector3(0.75, 0.38, 0.9)) {
    const tam = caixa.getSize(new THREE.Vector3());
    const centro = caixa.getCenter(new THREE.Vector3());
    const maior = Math.max(tam.x, tam.y, tam.z);
    const dist = (maior / 2) / Math.tan((camera.fov * Math.PI) / 360) * margem;
    irPara(centro.clone().addScaledVector(direcao.clone().normalize(), dist), centro);
  }

  const api = {
    update,
    irPara,
    voarPara,
    enquadrarCaixa,
    get ativo() { return est.ativo; },
    set colisores(lista) { est.colisores = lista ?? []; },
    get colisores() { return est.colisores; },
    bate,
    piso,
    get andando() { return est.andando; },
    set andando(v) { definirModo(!!v); },
    set ativo(v) { est.ativo = v; if (!v) { est.vel.set(0, 0, 0); tirarPassada(); est.agachado = 0; soltarMouse(); } },
    estado: est,
  };
  return api;
}
