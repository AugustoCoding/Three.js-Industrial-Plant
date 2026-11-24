import * as THREE from 'three';
import { BRACO } from '../data/ambiente.js';
import { geometriaBracoApontando } from '../lib/mao.js';

/**
 * ===========================================================================
 *  BRACO EM PRIMEIRA PESSOA  (pedido do autor, 24/11/2026)
 * ===========================================================================
 *  No modo andar, o RT do controle ergue o braco direito e aponta para a
 *  frente; o gatilho e analogico, entao meio apertado e meio erguido. Solto,
 *  o braco desce e sai da tela. Geometria em lib/mao.js; numeros em BRACO
 *  (data/ambiente.js).
 *
 *  Vai pendurado na camera (a camera entra na cena so para isso): segue o
 *  olhar no mesmo quadro, sem arrastar um quadro atras como faria se fosse
 *  reposicionado num gancho. Desenha por ultimo e com profundidade propria:
 *  os materiais sao "transparentes" de opacidade 1 so para cair na ultima
 *  passada, e uma peca invisivel logo antes limpa o buffer de profundidade.
 *  Perto de uma parede o braco nao some dentro dela, e os dedos se cobrem
 *  entre si direito.
 *  Nao responde a raio (auditorias, passeio, noite lancam raios na cena).
 */
export function criarBraco({ cena }) {
  const { camera, scene, controls } = cena;
  const B = BRACO;
  if (!camera.parent) scene.add(camera);

  const mat = (cor, rugosidade, nome) => {
    const m = new THREE.MeshStandardMaterial({
      color: cor, roughness: rugosidade, metalness: 0, transparent: true, opacity: 1, fog: false,
    });
    m.name = nome;
    return m;
  };
  const geo = geometriaBracoApontando(B.mao);
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
  for (const [g, m] of [[geo.pele, mat(B.pele, 0.62, 'braco-pele')], [geo.manga, mat(B.camisa, 0.9, 'braco-manga')]]) {
    const malha = new THREE.Mesh(g, m);
    malha.renderOrder = 1001;
    ombro.add(malha);
  }
  ombro.traverse((o) => { o.frustumCulled = false; o.raycast = () => {}; });
  ombro.visible = false;
  camera.add(ombro);

  const rad = THREE.MathUtils.degToRad;
  let t = 0;

  function atualizar(dt) {
    const andando = controls.ativo && controls.andando;
    const alvo = andando ? controls.estado.gatilhoDireito : 0;
    t += (alvo - t) * (1 - Math.exp(-B.subida * dt));
    if (t < 1e-3 && alvo === 0) t = 0;
    // fora do modo andar some na hora: o voo ate uma vista nao leva braco
    ombro.visible = t > 0 && andando;
    if (!ombro.visible) return;
    const e = t * t * (3 - 2 * t);
    ombro.rotation.set(
      rad(B.giroRepouso[0] + (B.giroAponta[0] - B.giroRepouso[0]) * e),
      rad(B.giroRepouso[1] + (B.giroAponta[1] - B.giroRepouso[1]) * e),
      0, 'YXZ',
    );
  }

  return { grupo: ombro, atualizar, get erguido() { return t; } };
}
