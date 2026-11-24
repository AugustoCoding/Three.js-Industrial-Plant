import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Antebraco e mao direita apontando (o braco em primeira pessoa,
 * site/braco.js). Palma para baixo, polegar do lado de dentro (-x),
 * indicador esticado para -z, medio, anelar e minimo dobrados sob a palma e
 * o polegar recolhido junto da base do indicador. Origem no cotovelo.
 *
 * Com `aponta` falso, o indicador dobra como os outros: a mao fechada que
 * segura um item (site/roda.js); o cabo passa no oco dos dedos, ao longo
 * de x, em `centroPunho(M)`.
 *
 * Devolve duas geometrias fundidas, uma por material: `pele` e `manga`.
 * Medidas `M` (m) vem de BRACO.mao (data/ambiente.js).
 */
export function geometriaBracoApontando(M, aponta = true) {
  const pele = [], manga = [];
  const Y = new THREE.Vector3(0, 1, 0);

  /** Capsula de `a` ate `b` (vetores), raio `r`: falange, polegar. */
  function capsula(a, b, r, lista = pele) {
    const d = new THREE.Vector3().subVectors(b, a);
    const g = new THREE.CapsuleGeometry(r, Math.max(1e-4, d.length()), 4, 10);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, d.clone().normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    lista.push(g);
  }
  /** Tronco de cone ao longo de -z, de z0 a z1, achatado em y. */
  function tronco(z0, z1, r0, r1, achata, lista) {
    const g = new THREE.CylinderGeometry(r1, r0, z0 - z1, 18, 1, false);
    g.rotateX(-Math.PI / 2);                    // eixo y -> -z (topo na frente)
    g.scale(1, achata, 1);
    g.translate(0, 0, (z0 + z1) / 2);
    lista.push(g);
  }
  const v = (x, y, z) => new THREE.Vector3(x, y, z);

  // antebraco afinando ate o punho, e a manga arregacada perto do cotovelo
  const zp = -M.antebraco;
  tronco(0, zp, M.raioCotovelo, M.raioPunho, 0.85, pele);
  tronco(0.03, -M.manga, M.raioCotovelo + 0.009, M.raioCotovelo + 0.006, 0.9, manga);

  // palma: caixa arredondada, mais larga que alta
  const [pl, pa, pc] = M.palma;
  const palma = new RoundedBoxGeometry(pl, pa, pc, 3, Math.min(pa / 2, 0.013));
  palma.translate(0, 0, zp - pc / 2 + 0.008);
  pele.push(palma);
  const zn = zp - pc + 0.01;                    // linha dos nos dos dedos

  // indicador esticado, em duas falanges que afinam
  const xi = -pl / 2 + M.raioDedo;
  if (aponta) {
    capsula(v(xi, 0.003, zn), v(xi, 0.004, zn - M.indicador * 0.55), M.raioDedo);
    capsula(v(xi, 0.004, zn - M.indicador * 0.55), v(xi, 0.002, zn - M.indicador), M.raioDedo * 0.88);
  }

  // medio, anelar e minimo dobrados para baixo e para tras, sob a palma
  (aponta ? [0.33, 0.62, 0.9] : [0.05, 0.33, 0.62, 0.9]).forEach((f, i) => {
    const x = -pl / 2 + Math.max(f * pl, M.raioDedo), r = M.raioDedo * (1 - 0.07 * (aponta ? i + 1 : i));
    const a = v(x, 0.002, zn), b = v(x, -0.016, zn - 0.02), c = v(x, -pa / 2 - 0.009, zn + 0.006);
    capsula(a, b, r);
    capsula(b, c, r * 0.92);
  });

  // polegar: sai da lateral da palma e encosta sob a base do indicador
  const t0 = v(-pl / 2 + 0.004, -0.006, zp - 0.022);
  const t1 = v(-pl / 2 - 0.004, -0.014, zn + 0.012);
  const t2 = v(-pl / 2 + 0.012, -0.019, zn - 0.01);
  capsula(t0, t1, M.raioDedo * 1.15);
  capsula(t1, t2, M.raioDedo * 1.05);

  const fundir = (l) => mergeGeometries(l.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  return { pele: fundir(pele), manga: fundir(manga) };
}

/** Onde fica o oco da mao fechada (referencial do cotovelo): o cabo de um
 *  item passa ai, ao longo de x. */
export function centroPunho(M) {
  const zn = -M.antebraco - M.palma[2] + 0.01;
  return new THREE.Vector3(0, -M.palma[1] / 2 - 0.006, zn - 0.006);
}
