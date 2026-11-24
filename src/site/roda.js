import * as THREE from 'three';
import { ITENS, RODA } from '../data/itens.js';
import { CONSTRUIR } from '../lib/itens.js';

/**
 * ===========================================================================
 *  RODA DE ITENS  (pedido do autor, 24/11/2026, "igual em GTA")
 * ===========================================================================
 *  So no modo andar. LB (ou Tab) segurado abre a roda; o analogico direito,
 *  o mouse travado ou o ponteiro sobre ela escolhem; soltar equipa (os
 *  numeros ficam com as vistas). Com a roda aberta o olhar para (controls.olharTravado).
 *  O item vai na mao do braco (site/braco.js), baixo; o LT (botao direito,
 *  com o mouse travado) ergue e mira, e o RT (botao esquerdo) o usa:
 *    lanterna  liga e desliga um facho (SpotLight que existe desde o inicio,
 *              com intensidade 0: luz nova recompila todo shader, ~3 s);
 *    sanduiche uma mordida por toque; acabou, outro aparece;
 *    bazuca    foguete que voa ate bater (raio na cena) e vira fumaca;
 *    cafe      segurando, leva a caneca a boca;
 *    buzina    fom-fom (Web Audio, sem arquivo de som).
 *  Numeros em RODA, lista em ITENS (data/itens.js).
 */
export function criarRoda({ cena, braco, avisar }) {
  const { camera, scene, controls } = cena;
  const est = controls.estado;
  const N = ITENS.length;

  /* ---------------- a roda na tela ---------------- */
  const el = document.createElement('div');
  el.className = 'roda-itens';
  el.innerHTML = `<style>
    .roda-itens{position:fixed;left:50%;top:50%;width:${RODA.raio * 2 + 110}px;height:${RODA.raio * 2 + 110}px;
      transform:translate(-50%,-50%) scale(.9);opacity:0;pointer-events:none;transition:opacity .12s,transform .12s;z-index:60;
      font-family:system-ui,sans-serif;color:#fff}
    .roda-itens.aberta{opacity:1;transform:translate(-50%,-50%) scale(1);pointer-events:auto}
    .roda-itens .fundo{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,rgba(10,14,20,.25) 0 28%,rgba(10,14,20,.72) 29% 100%);
      box-shadow:0 0 0 2px rgba(255,255,255,.12) inset}
    .roda-itens .item{position:absolute;width:86px;height:86px;margin:-43px 0 0 -43px;border-radius:50%;display:grid;place-items:center;
      align-content:center;gap:2px;font-size:30px;transition:background .1s,transform .1s}
    .roda-itens .item small{font-size:11px;opacity:.85}
    .roda-itens .item.sel{background:rgba(255,255,255,.22);transform:scale(1.12)}
    .roda-itens .item.equipado small{color:#ffd54a}
    .roda-itens .centro{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);text-align:center;width:150px;font-size:13px}
    .roda-itens .centro b{display:block;font-size:17px;margin-bottom:2px}
  </style><div class="fundo"></div><div class="centro"><b></b><span></span></div>`;
  const meio = RODA.raio + 55;
  const slots = ITENS.map((it, i) => {
    const a = (i / N) * Math.PI * 2;                // 0 no alto, sentido horario
    const s = document.createElement('div');
    s.className = 'item';
    s.style.left = `${meio + Math.sin(a) * RODA.raio}px`;
    s.style.top = `${meio - Math.cos(a) * RODA.raio}px`;
    s.innerHTML = `<span>${it.icone}</span><small>${it.nome}</small>`;
    s.addEventListener('pointerenter', () => escolher(i));
    s.addEventListener('click', () => { escolher(i); fechar(true); });
    el.appendChild(s);
    return s;
  });
  document.body.appendChild(el);
  const titulo = el.querySelector('.centro b'), dica = el.querySelector('.centro span');

  let aberta = false, sel = 0, atual = 'mao';
  function escolher(i) {
    sel = i;
    slots.forEach((s, k) => s.classList.toggle('sel', k === i));
    titulo.textContent = ITENS[i].nome;
    dica.textContent = ITENS[i].dica;
  }
  function abrir() {
    if (aberta || !controls.andando || !controls.ativo) return;
    aberta = true;
    est.olharTravado = true;
    est.mouseRoda.x = est.mouseRoda.y = 0;
    escolher(ITENS.findIndex((it) => it.id === atual));
    el.classList.add('aberta');
  }
  function fechar(equipa = true) {
    if (!aberta) return;
    aberta = false;
    est.olharTravado = false;
    el.classList.remove('aberta');
    if (equipa) equipar(ITENS[sel].id);
  }

  /* ---------------- os itens ---------------- */
  const objetos = {};
  for (const [id, f] of Object.entries(CONSTRUIR)) objetos[id] = f();

  // o facho da lanterna: preso a camera, mirando o centro da tela
  const L = RODA.lanterna;
  const facho = new THREE.SpotLight(0xfff1d0, 0, L.alcance, THREE.MathUtils.degToRad(L.abertura), L.penumbra, 1.5);
  facho.position.set(0.2, -0.15, -0.3);
  facho.target.position.set(0, 0, -10);
  camera.add(facho, facho.target);
  let lanternaLigada = false;

  function equipar(id) {
    if (id === atual) return;
    atual = id;
    braco.segurar(objetos[id] ?? null, RODA.baixo);
    ITENS.forEach((it, k) => slots[k].classList.toggle('equipado', it.id === id));
    const it = ITENS.find((x) => x.id === id);
    avisar?.(`${it.icone} ${it.nome} — ${it.dica}`);
  }

  /* ---------------- usar ---------------- */
  let rtAntes = 0, animo = 0, mordidas = 0, reabastece = 0, recarga = 0, gole = 0;
  const projeteis = [], fumacas = [];
  const rc = new THREE.Raycaster();
  const v = new THREE.Vector3(), dir = new THREE.Vector3();

  function buzinar() {
    try {
      const ctx = buzinar.ctx ??= new (window.AudioContext || window.webkitAudioContext)();
      const t0 = ctx.currentTime;
      for (const [ini, f] of [[0, 392], [0.2, 330]]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, t0 + ini);
        g.gain.setValueAtTime(0.0001, t0 + ini);
        g.gain.exponentialRampToValueAtTime(0.18, t0 + ini + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + ini + 0.18);
        o.connect(g).connect(ctx.destination);
        o.start(t0 + ini);
        o.stop(t0 + ini + 0.2);
      }
    } catch { /* sem audio: so a pera aperta */ }
  }

  function disparar() {
    const F = RODA.foguete;
    const bz = objetos.bazuca;
    const corpo = new THREE.Group();
    const cone = new THREE.ConeGeometry(0.035, 0.09, 12);
    cone.rotateX(-Math.PI / 2);
    corpo.add(new THREE.Mesh(cone, bz.userData.ogiva.material));
    const tubo = new THREE.CylinderGeometry(0.03, 0.03, 0.25, 12);
    tubo.rotateX(-Math.PI / 2).translate(0, 0, 0.16);
    corpo.add(new THREE.Mesh(tubo, new THREE.MeshStandardMaterial({ color: 0x4b5a2a })));
    bz.localToWorld(v.copy(bz.userData.boca));
    corpo.position.copy(v);
    camera.getWorldDirection(dir);
    corpo.quaternion.copy(camera.quaternion);
    corpo.traverse((o) => { o.raycast = () => {}; });
    scene.add(corpo);
    projeteis.push({ corpo, dir: dir.clone(), vida: F.vida, rastro: 0 });
    est.pitchAlvo += F.coice;
    braco.gesto.frente = -0.08;
    bz.userData.ogiva.visible = false;
    recarga = 0.9;
  }

  /** Bola que cresce e some: fogo (cor viva, aditiva) ou fumaca (cinza). */
  function bola(pos, raio, duracao, cor, aditiva) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshBasicMaterial({
      color: cor, transparent: true, opacity: aditiva ? 0.9 : 0.55, depthWrite: false,
      blending: aditiva ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    m.position.copy(pos);
    m.scale.setScalar(0.01);
    m.raycast = () => {};
    scene.add(m);
    fumacas.push({ m, raio, duracao, t: 0, op: m.material.opacity, sobe: aditiva ? 0 : 1.2 });
  }
  function explodir(pos) {
    const F = RODA.foguete;
    bola(pos, F.raioExplosao, F.duracaoExplosao * 0.6, 0xff8a1c, true);
    bola(pos, F.raioExplosao * 0.6, F.duracaoExplosao * 0.4, 0xfff0a0, true);
    for (let k = 0; k < 4; k++) {
      bola(v.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2)),
        F.raioExplosao * (0.7 + Math.random() * 0.5), F.duracaoExplosao * 2.5, 0x8a8a8a, false);
    }
  }
  function sumir(m) {
    scene.remove(m);
    m.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  }

  function atualizar(dt) {
    const andando = controls.andando && controls.ativo;
    if (aberta && !andando) fechar(false);

    // escolha pela roda: analogico direito, ou o mouse travado
    if (aberta) {
      const a = est.analogicoDireito, m = est.mouseRoda;
      let x = 0, y = 0;
      if (Math.hypot(a.x, a.y) > RODA.zonaMorta) { x = a.x; y = a.y; }
      else if (Math.hypot(m.x, m.y) > RODA.mouseMinimo) { x = m.x; y = m.y; }
      if (x || y) {
        const ang = (Math.atan2(x, -y) + Math.PI * 2) % (Math.PI * 2);
        const i = Math.round(ang / (Math.PI * 2 / N)) % N;
        if (i !== sel) escolher(i);
      }
    }

    const rt = andando && !aberta ? est.gatilhoDireito : 0;
    const toque = rt > 0.6 && rtAntes <= 0.6;
    rtAntes = rt;
    const g = braco.gesto;
    g.x = g.y = g.z = g.cima = 0;
    // usar (RT) ergue o braco junto, como atirar sem mirar em jogo
    g.erguer = atual !== 'mao' && rt > 0.1 ? RODA.erguido : 0;
    g.frente *= Math.exp(-10 * dt);
    recarga = Math.max(0, recarga - dt);

    // lanterna: o facho so existe com ela na mao, andando
    if (atual === 'lanterna' && toque) {
      lanternaLigada = !lanternaLigada;
      avisar?.(lanternaLigada ? '🔦 Lanterna ligada' : '🔦 Lanterna desligada');
    }
    const acesa = lanternaLigada && atual === 'lanterna' && andando;
    facho.intensity = acesa ? L.intensidade : 0;
    objetos.lanterna.userData.lente.material.emissiveIntensity = acesa ? 3 : 0;

    if (atual === 'sanduiche') {
      const r = objetos.sanduiche.userData.recheio;
      if (reabastece > 0) {
        reabastece -= dt;
        if (reabastece <= 0) { mordidas = 0; r.visible = true; r.scale.z = 1; }
      } else if (toque && animo <= 0) animo = 0.45;
      if (animo > 0) {
        animo -= dt;
        const f = Math.sin(Math.PI * (1 - animo / 0.45));   // vai e volta
        g.x = 0.55 * f; g.y = 0.25 * f; g.cima = 0.07 * f; g.frente = -0.12 * f;
        if (animo <= 0.22 && animo + dt > 0.22) {
          mordidas++;
          r.scale.z = Math.max(0.12, 1 - mordidas / RODA.mordidas);
          r.position.z = -0.05 * r.scale.z;
          if (mordidas >= RODA.mordidas) { r.visible = false; reabastece = 2; avisar?.('🥪 Nham! Acabou… outro já vem'); }
        }
      }
    }

    if (atual === 'cafe') {
      gole += ((rt > 0.3 ? 1 : 0) - gole) * (1 - Math.exp(-6 * dt));
      g.x = 0.5 * gole; g.y = 0.3 * gole; g.z = 0.9 * gole; g.cima = 0.06 * gole; g.frente = -0.1 * gole;
    } else gole = 0;

    if (atual === 'bazuca') {
      if (toque && recarga <= 0) disparar();
      if (recarga <= 0.3) objetos.bazuca.userData.ogiva.visible = true;
    }

    if (atual === 'buzina') {
      if (toque) { buzinar(); animo = 0.18; }
      animo = Math.max(0, animo - dt);
      objetos.buzina.userData.pera.scale.set(1 + animo * 1.5, 1 - animo * 2.5, 1.25);
    }

    // foguetes no ar: anda, testa o trecho contra a cena, explode
    for (let k = projeteis.length - 1; k >= 0; k--) {
      const p = projeteis[k];
      const passo = RODA.foguete.vel * dt;
      p.vida -= dt;
      rc.set(p.corpo.position, p.dir);
      rc.far = passo;
      const hit = rc.intersectObjects(scene.children, true).find((h) => h.object.visible);
      if (hit || p.vida <= 0 || p.corpo.position.y < 0) {
        explodir(hit ? hit.point : p.corpo.position);
        sumir(p.corpo);
        projeteis.splice(k, 1);
        continue;
      }
      p.corpo.position.addScaledVector(p.dir, passo);
      p.rastro += dt;
      if (p.rastro > 0.04) { p.rastro = 0; bola(p.corpo.position, 0.25, 0.6, 0xbbbbbb, false); }
    }
    for (let k = fumacas.length - 1; k >= 0; k--) {
      const f = fumacas[k];
      f.t += dt;
      const u = Math.min(1, f.t / f.duracao);
      f.m.scale.setScalar(Math.max(0.01, f.raio * (1 - (1 - u) ** 3)));
      f.m.material.opacity = f.op * (1 - u);
      f.m.position.y += f.sobe * dt;
      if (u >= 1) { sumir(f.m); f.m.material.dispose(); fumacas.splice(k, 1); }
    }
  }

  /* ---------------- teclado ---------------- */
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === 'Tab' && controls.andando) { e.preventDefault(); if (!e.repeat) abrir(); }
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Tab') fechar(true); });

  return { abrir, fechar, equipar, atualizar, get aberta() { return aberta; }, get item() { return atual; } };
}
