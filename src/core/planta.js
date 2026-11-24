import * as THREE from 'three';

/**
 * ===========================================================================
 *  VISTA DE PLANTA — o terreno visto de cima, norte para cima
 * ===========================================================================
 *  Para ler a implantacao como desenho: blocos, vias e cotas de distancia.
 *  Roda: aproxima e afasta. Arrastar: desloca. P ou o botao: volta a vista
 *  livre exatamente onde estava.
 *
 *  E a mesma camera em perspectiva, so que bem alta e com campo de visao
 *  estreito (25°): de 300 m, um reator de 16 m quase nao se deforma. Trocar
 *  por uma camera ortografica exigiria ensinar a outra camera ao seletor, as
 *  etiquetas e ao corte, que hoje recebem esta; o ganho nao paga.
 *
 *  Dois cuidados que a altura exige:
 *    - neblina desligada: ela comeca a 130 m e apagaria o chao;
 *    - near/far apertados em volta do chao: a precisao do z-buffer depende de
 *      far/near, e as camadas do chao estao a 4-5 cm umas das outras.
 */
export function criarVistaPlanta(cena, { limites, aoMudar } = {}) {
  const { camera, controls, scene, renderer } = cena;
  const dom = renderer.domElement;
  const FOV = 25;
  const ALTURA_MAX_OBJETO = 60;      // nada na cena passa disso

  let ativa = false;
  let salvo = null;
  let H = 300, cx = 0, cz = 0;
  let arrasto = null;

  function aplicar() {
    camera.position.set(cx, H, cz);
    const est = controls.estado;
    est.yaw = est.yawAlvo = 0;                 // yaw 0 olha para -Z: norte em cima
    est.pitch = est.pitchAlvo = -Math.PI / 2;
    camera.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0, 'YXZ'));
    camera.near = Math.max(0.5, H - ALTURA_MAX_OBJETO);
    camera.far = H + 2;
    camera.updateProjectionMatrix();
  }

  /** Altura que faz o lote inteiro caber, com 8 % de folga dos lados e
   *  mais em cima: a barra de botoes do HUD cobre ~10 % do alto da tela, e
   *  as cotas do norte do lote ficavam embaixo dela. */
  function enquadrar() {
    const t = Math.tan((FOV * Math.PI) / 360);
    const w = limites.x1 - limites.x0;
    const d = limites.z1 - limites.z0;
    H = Math.max((d / 2 / t) * 1.2, (w / 2 / (t * camera.aspect)) * 1.08);
    cx = (limites.x0 + limites.x1) / 2;
    // o norte (-z) fica no alto da tela: o centro sobe para o lote descer
    cz = (limites.z0 + limites.z1) / 2 - d * 0.05;
    aplicar();
  }

  function ativar() {
    const est = controls.estado;
    // desativar antes de guardar: tira o balanco da passada e o fov da corrida
    controls.ativo = false;
    salvo = {
      pos: camera.position.clone(), fov: camera.fov, near: camera.near, far: camera.far,
      fog: scene.fog, yaw: est.yaw, pitch: est.pitch,
    };
    controls.ativo = false;
    scene.fog = null;
    camera.fov = FOV;
    ativa = true;
    enquadrar();
    aoMudar?.(true);
  }

  function desativar() {
    const est = controls.estado;
    camera.position.copy(salvo.pos);
    camera.fov = salvo.fov;
    camera.near = salvo.near;
    camera.far = salvo.far;
    camera.updateProjectionMatrix();
    scene.fog = salvo.fog;
    est.yaw = est.yawAlvo = salvo.yaw;
    est.pitch = est.pitchAlvo = salvo.pitch;
    controls.ativo = true;
    ativa = false;
    aoMudar?.(false);
  }

  dom.addEventListener('wheel', (e) => {
    if (!ativa) return;
    e.preventDefault();
    H = THREE.MathUtils.clamp(H * (e.deltaY > 0 ? 1.15 : 1 / 1.15), 25, 850);
    aplicar();
  }, { passive: false });

  dom.addEventListener('pointerdown', (e) => {
    if (!ativa) return;
    arrasto = { x: e.clientX, y: e.clientY };
  });
  dom.addEventListener('pointermove', (e) => {
    if (!ativa || !arrasto) return;
    // metros por pixel na altura atual: o chao acompanha o cursor
    const mpp = (2 * H * Math.tan((FOV * Math.PI) / 360)) / (dom.clientHeight || 1);
    cx -= (e.clientX - arrasto.x) * mpp;
    cz -= (e.clientY - arrasto.y) * mpp;
    arrasto = { x: e.clientX, y: e.clientY };
    aplicar();
  });
  const soltar = () => { arrasto = null; };
  dom.addEventListener('pointerup', soltar);
  dom.addEventListener('pointercancel', soltar);
  window.addEventListener('resize', () => { if (ativa) aplicar(); });

  return {
    alternar() { if (ativa) desativar(); else ativar(); },
    enquadrar,
    get ativa() { return ativa; },
  };
}
