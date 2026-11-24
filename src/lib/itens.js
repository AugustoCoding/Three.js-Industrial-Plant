import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Os itens da roda (data/itens.js), para a mao fechada do braco em primeira
 * pessoa. Origem no oco da mao; a frente do item e -z, o alto e +y. Medidas
 * [ADOTADO] de objeto comum (lanterna de 20 cm, caneca de 9 cm...).
 * Cada funcao devolve um Group; `userData` leva o que site/roda.js anima
 * (a ponta da lanterna, o recheio que encolhe a cada mordida...).
 */
const mat = (cor, o = {}) => new THREE.MeshStandardMaterial({ color: cor, roughness: 0.6, metalness: 0, ...o });
function peca(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  return m;
}
/** Cilindro deitado ao longo de z, de z0 a z1. */
function cilZ(r0, r1, z0, z1, material, seg = 20) {
  const g = new THREE.CylinderGeometry(r1, r0, Math.abs(z0 - z1), seg);
  g.rotateX(-Math.PI / 2);
  return peca(g, material, 0, 0, (z0 + z1) / 2);
}

export function lanterna() {
  const g = new THREE.Group();
  const preto = mat(0x1d1d1f, { roughness: 0.45 }), amarelo = mat(0xf2b705, { roughness: 0.4 });
  g.add(cilZ(0.017, 0.017, 0.06, -0.09, preto));
  g.add(cilZ(0.019, 0.029, -0.09, -0.13, amarelo));
  const lente = peca(new THREE.CircleGeometry(0.025, 24), new THREE.MeshStandardMaterial({
    color: 0xfffbe8, emissive: 0xfff3c0, emissiveIntensity: 0, roughness: 0.2,
  }), 0, 0, -0.1305);
  lente.rotation.y = Math.PI;                    // a face olha para -z
  lente.material.name = 'lente-lanterna';
  g.add(lente);
  g.add(peca(new THREE.BoxGeometry(0.008, 0.006, 0.02), mat(0xc0392b), 0, 0.018, -0.03));   // o botao
  g.userData.lente = lente;
  g.userData.ponta = new THREE.Vector3(0, 0, -0.14);
  return g;
}

export function sanduiche() {
  const g = new THREE.Group();
  const recheio = new THREE.Group();
  const pao = mat(0xd9a35b, { roughness: 0.85 });
  const fatia = () => new RoundedBoxGeometry(0.11, 0.022, 0.1, 2, 0.008);
  recheio.add(peca(fatia(), pao, 0, -0.024, 0));
  recheio.add(peca(new THREE.BoxGeometry(0.118, 0.006, 0.108), mat(0x5fae3a, { roughness: 0.8 }), 0, -0.01, 0));
  recheio.add(peca(new THREE.BoxGeometry(0.1, 0.005, 0.1), mat(0xf4c430), 0, -0.004, 0));
  const tomate = new THREE.CylinderGeometry(0.03, 0.03, 0.006, 18);
  recheio.add(peca(tomate, mat(0xd6362b), -0.025, 0.002, 0.02), peca(tomate.clone(), mat(0xd6362b), 0.025, 0.002, -0.02));
  recheio.add(peca(fatia(), pao, 0, 0.016, 0));
  // o sanduiche anda a frente da mao: a mordida come pela frente (-z)
  recheio.position.z = -0.05;
  g.add(recheio);
  g.userData.recheio = recheio;
  return g;
}

export function bazuca() {
  const g = new THREE.Group();
  const verde = mat(0x4b5a2a, { roughness: 0.7 }), escuro = mat(0x22261a, { roughness: 0.5 });
  g.add(cilZ(0.045, 0.045, 0.1, -0.55, verde));
  g.add(cilZ(0.052, 0.052, -0.55, -0.6, escuro));
  g.add(cilZ(0.05, 0.05, 0.1, 0.13, escuro));
  g.add(peca(new THREE.BoxGeometry(0.025, 0.05, 0.08), escuro, -0.045, 0.06, -0.05));   // a mira
  g.add(peca(new THREE.BoxGeometry(0.025, 0.07, 0.035), escuro, 0, -0.04, 0));          // o punho
  const ogiva = new THREE.ConeGeometry(0.035, 0.09, 16);
  ogiva.rotateX(-Math.PI / 2);
  const ponta = peca(ogiva, mat(0xc0392b, { roughness: 0.4 }), 0, 0, -0.63);
  g.add(ponta);
  // apoiada sobre a mao e baixada contra o giro do braco: o cano segue o olhar
  g.position.y = 0.055;
  g.rotation.x = -0.28;
  g.userData.ogiva = ponta;
  g.userData.boca = new THREE.Vector3(0, 0, -0.62);
  return g;
}

export function cafe() {
  const g = new THREE.Group();
  const louca = mat(0xf4f1ea, { roughness: 0.35 });
  const corpo = new THREE.CylinderGeometry(0.037, 0.033, 0.09, 24, 1, true);
  const caneca = new THREE.Group();
  caneca.add(peca(corpo, new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.35, side: THREE.DoubleSide })));
  caneca.add(peca(new THREE.CircleGeometry(0.033, 24).rotateX(Math.PI / 2), louca, 0, -0.045, 0));
  caneca.add(peca(new THREE.CircleGeometry(0.035, 24).rotateX(-Math.PI / 2), mat(0x3b2416, { roughness: 0.2 }), 0, 0.032, 0));
  const alca = new THREE.TorusGeometry(0.022, 0.0065, 8, 16, Math.PI);
  alca.rotateZ(-Math.PI / 2);
  caneca.add(peca(alca, louca, 0.036, 0, 0));
  // a mao segura pela alca: a caneca fica a esquerda e acima do punho
  caneca.position.set(-0.06, 0.05, -0.01);
  g.add(caneca);
  g.userData.caneca = caneca;
  return g;
}

export function buzina() {
  const g = new THREE.Group();
  const pera = peca(new THREE.SphereGeometry(0.032, 18, 12), mat(0xd62b2b, { roughness: 0.75 }), 0, 0.01, 0.025);
  pera.scale.set(1, 1, 1.25);
  g.add(pera);
  const latao = mat(0xc9a227, { roughness: 0.3, metalness: 0.8 });
  g.add(cilZ(0.008, 0.008, 0, -0.07, latao));
  g.add(cilZ(0.008, 0.045, -0.07, -0.17, latao));
  g.children.forEach((c, i) => { if (i > 0) c.position.y += 0.01; });
  g.userData.pera = pera;
  return g;
}

export const CONSTRUIR = { lanterna, sanduiche, bazuca, cafe, buzina };
