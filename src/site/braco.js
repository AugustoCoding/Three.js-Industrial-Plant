import * as THREE from 'three';
import { BRACO } from '../data/ambiente.js';
import { geometriaBracoApontando, centroPunho } from '../lib/mao.js';

/**
 * ===========================================================================
 *  BRACO EM PRIMEIRA PESSOA  (pedido do autor, 24/11/2026)
 * ===========================================================================
 *  No modo andar o LT do controle ergue o braco direito (de mao vazia,
 *  aponta); o gatilho e analogico, entao meio apertado e meio erguido.
 *  Solto, o braco desce e sai da tela. Com um item da roda (site/roda.js),
 *  a mao fecha, o item vai no oco dela e fica baixo a vista; o LT o ergue
 *  e o RT o usa, e quem usa soma o gesto (`gesto`, radianos e metros).
 *  Geometria em lib/mao.js; numeros em BRACO (data/ambiente.js).
 *
 *  Vai pendurado na camera (a camera entra na cena so para isso): segue o
 *  olhar no mesmo quadro, sem arrastar um quadro atras como faria se fosse
 *  reposicionado num gancho. Desenha por ultimo e com profundidade propria:
 *  os materiais sao "transparentes" de opacidade 1 so para cair na ultima
 *  passada, e uma peca invisivel logo antes limpa o buffer de profundidade.
 *  Perto de uma parede o braco nao some dentro dela, e os dedos se cobrem
 *  entre si direito. Item novo passa por `preparar` (o mesmo tratamento).
 *  Nao responde a raio (auditorias, passeio, noite lancam raios na cena).
 */
export function criarBraco({ cena }) {
  const { camera, scene, controls } = cena;
  const B = BRACO;
  if (!camera.parent) scene.add(camera);

  const mat = (cor, rugosidade, nome) => {
    const m = new THREE.MeshStandardMaterial({ color: cor, roughness: rugosidade, metalness: 0 });
    m.name = nome;
    return m;
  };
  /** Por ultimo, com profundidade propria, sem raio e sem sombra. */
  function preparar(obj) {
    obj.traverse((o) => {
      o.frustumCulled = false;
      o.raycast = () => {};
      if (!o.isMesh || o === limpa) return;
      o.renderOrder = 1001;
      o.castShadow = o.receiveShadow = false;
      for (const m of [o.material].flat()) { m.transparent = true; m.opacity = 1; m.fog = false; }
    });
    return obj;
  }

  const ombro = new THREE.Group();
  ombro.name = 'braco-primeira-pessoa';
  ombro.userData.animar = true;
  ombro.position.fromArray(B.ombro);

  // limpa a profundidade logo antes do braco (nada desenha: so a cor some)
  const limpa = new THREE.Mesh(
    new THREE.PlaneGeometry(1e-3, 1e-3),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true }),
  );
  limpa.renderOrder = 1000;
  limpa.onBeforeRender = (renderer) => renderer.clearDepth();
  ombro.add(limpa);

  const pele = mat(B.pele, 0.62, 'braco-pele'), manga = mat(B.camisa, 0.9, 'braco-manga');
  const maos = {};
  for (const aponta of [true, false]) {
    const geo = geometriaBracoApontando(B.mao, aponta);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo.pele, pele), new THREE.Mesh(geo.manga, manga));
    g.visible = aponta;
    maos[aponta ? 'aponta' : 'fechada'] = g;
    ombro.add(g);
  }
  // o oco da mao fechada, onde o item vai
  const punho = new THREE.Group();
  punho.position.copy(centroPunho(B.mao));
  ombro.add(punho);
  preparar(ombro);
  ombro.visible = false;
  camera.add(ombro);

  const rad = THREE.MathUtils.degToRad;
  let t = 0, item = null, erguido = 0;
  const gesto = { x: 0, y: 0, z: 0, frente: 0, cima: 0, erguer: 0 };

  /** Poe `obj` na mao (ou tira, com null); `fracao` e quanto o braco fica
   *  erguido segurando. */
  function segurar(obj, fracao = 0.55) {
    if (item) punho.remove(item);
    item = obj ? preparar(obj) : null;
    if (item) punho.add(item);
    erguido = item ? fracao : 0;
    maos.aponta.visible = !item;
    maos.fechada.visible = !!item;
  }

  function atualizar(dt) {
    const andando = controls.ativo && controls.andando;
    // LT ergue; com item, a mao fica baixa a vista; usando, o item ergue o
    // braco o quanto o gesto pedir (gesto.erguer)
    const alvo = !andando ? 0 : Math.max(item ? erguido : 0, controls.estado.gatilhoEsquerdo, gesto.erguer);
    t += (alvo - t) * (1 - Math.exp(-B.subida * dt));
    if (t < 1e-3 && alvo === 0) t = 0;
    // fora do modo andar some na hora: o voo ate uma vista nao leva braco
    ombro.visible = t > 0 && andando;
    if (!ombro.visible) return;
    const e = t * t * (3 - 2 * t);
    ombro.rotation.set(
      rad(B.giroRepouso[0] + (B.giroAponta[0] - B.giroRepouso[0]) * e) + gesto.x,
      rad(B.giroRepouso[1] + (B.giroAponta[1] - B.giroRepouso[1]) * e) + gesto.y,
      gesto.z, 'YXZ',
    );
    ombro.position.fromArray(B.ombro);
    ombro.position.z -= gesto.frente;
    ombro.position.y += gesto.cima;
  }

  return { grupo: ombro, punho, atualizar, segurar, gesto, get erguido() { return t; } };
}
