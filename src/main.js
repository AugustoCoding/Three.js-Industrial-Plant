import * as THREE from 'three';
import './style.css';

import { criarCena } from './core/scene.js';
import { criarUI } from './core/ui.js';
import { criarGerenciadorRotulos } from './core/rotulos.js';
import { criarR01 } from './equipment/R-01.js';
import { criarV01 } from './equipment/V-01.js';
import { criarV02 } from './equipment/V-02.js';
import { criarTK01 } from './equipment/TK-01.js';
import { criarExtra, EXTRAS } from './equipment/generico.js';
import { criarTubulacao } from './equipment/tubulacao.js';
import { criarPipeRack } from './lib/rack.js';
import { criarInstrumentacao } from './equipment/instrumentacao.js';
import { criarImplantacao } from './site/implantacao.js';
import { criarAreaProcesso } from './site/processo.js';
import { criarEntorno } from './site/entorno.js';
import { criarInteriores } from './site/interiores.js';
import { criarPipeways } from './site/pipeways.js';
import { criarSeguranca } from './site/seguranca.js';
import { criarAlivio } from './equipment/alivio.js';
import { criarBloqueioLimite } from './equipment/limiteBateria.js';
import { criarIluminacaoLaje } from './equipment/iluminacaoLaje.js';
import { criarVento } from './site/vento.js';
import { criarAnimacoes } from './site/animacoes.js';
import { criarBandeiras } from './site/bandeiras.js';
import { criarMapaPedestre } from './site/mapaPedestre.js';
import { criarAmbiente } from './site/ambiente.js';
import { criarRotinas } from './site/rotinas.js';
import { criarOperacoes } from './site/operacoes.js';
import { criarCompanheiro } from './site/companheiro.js';
import { criarBraco } from './site/braco.js';
import { criarPasseio } from './site/passeio.js';
import { criarNoite } from './site/noite.js';
import { criarFaixas } from './lib/faixas.js';
import { triplanar } from './lib/texturas.js';
import { criarLegendaTubos } from './site/legendaTubos.js';
import { criarSetasTubos } from './site/setasTubos.js';
import { criarPassaros } from './site/passaros.js';
import { criarBussola } from './core/bussola.js';
import { FAIXAS, FAIXA } from './data/rotas.js';
import { pintarTags } from './equipment/pinturas.js';
import { fundir, podarSombras } from './core/fundir.js';
import { registrarFuros } from './lib/furos.js';
import { VISTAS } from './data/vistas.js';
import { LOCALIZAR } from './data/ambiente.js';
import { criarVistaPlanta } from './core/planta.js';
import { BLOCOS } from './data/site.js';
import { ARRANJO } from './data/arranjo.js';
import { R01 } from './data/plant.js';

const container = document.getElementById('app');
const cena = criarCena(container);

/* ==========================================================================
 *  ARRANJO DA AREA DE PROCESSO
 *  As posicoes sao dados (src/data/arranjo.js, Fase 4). Aqui so se escolhe o
 *  construtor: os quatro equipamentos com arquivo proprio, e o generico para
 *  os demais.
 * ======================================================================= */
const CONSTRUTORES = { 'R-01': criarR01, 'V-01': criarV01, 'V-02': criarV02, 'TK-01': criarTK01 };

const equipamentos = {};      // com ancoras e camadas — os quatro documentados
const todos = {};             // tudo que esta na cena, para foco e ficha

for (const item of ARRANJO) {
  const criar = CONSTRUTORES[item.tag];
  const e = criar ? criar() : criarExtra(item.tag);
  e.grupo.position.x += item.x;
  e.grupo.position.z += item.z;
  e.grupo.rotation.y = THREE.MathUtils.degToRad(item.giro);
  cena.scene.add(e.grupo);
  todos[item.tag] = e;
  if (criar) equipamentos[item.tag] = e;
}

/* Filtros rotativos giram de verdade, na rotacao do Datasheet (0,50 rpm, uma
 * volta a cada 120 s). Ate 22/10/2026 giravam uma volta a cada 36 s, lendo
 * como periodo o que o Apendice C da como tempo de filtracao por volta. */
const tambores = ['F-01', 'F-02']
  .filter((t) => todos[t]?.girante)
  // sentido horario visto de +z: sai do licor no lado -x e e raspado no +x (generico.js)
  .map((t) => ({ grupo: todos[t].girante, w: -(EXTRAS[t].geom.rotacao / 60) * Math.PI * 2 }));

const equip = equipamentos['R-01'];        // equipamento de referencia inicial

/* Laje de concreto sob a area de processo: e o bloco ISBL da implantacao,
 * entao o limite do processo e um numero so (src/data/site.js). */
const isbl = BLOCOS.find((b) => b.id === 'ISBL');
cena.criarLaje(
  isbl.x[1] - isbl.x[0], isbl.z[1] - isbl.z[0],
  new THREE.Vector3((isbl.x[0] + isbl.x[1]) / 2, 0, (isbl.z[0] + isbl.z[1]) / 2),
);

/* Implantacao: terreno, blocos, vias e distancias (Fase 3). As etiquetas e as
 * cotas dela so aparecem na vista de planta. */
const implantacao = criarImplantacao();
implantacao.rotulosPlanta.visible = false;
cena.scene.add(implantacao.grupo);
// mapa de pedestres na vista de planta (Fase 28): calcada, travessia, trecho
// na pista e porta sem caminho
const mapaPedestre = criarMapaPedestre({ chao: implantacao.chao });
implantacao.rotulosPlanta.add(mapaPedestre.grupo);

/* Entorno (Fase 7): predios, tanques, utilidades, meio-fio e cerca sobre os
 * blocos da implantacao. */
const entorno = criarEntorno();
cena.scene.add(entorno.grupo);

/* Interiores (Fase 16): salas e moveis de cada predio. Paredes, lajes e
 * divisorias viram colisores da camera; o interior so aparece de perto e as
 * portas abrem quando a camera chega. */
const interiores = criarInteriores({ entorno });
cena.controls.colisores = interiores.colisores;
// Dentro de predio, sem oclusao de ambiente: o GTAO de 0,8 m mancha de
// branco a parede lisa vista de perto. (`realismo` existe quando o laco roda.)
let dentroDePredio = false;
// quem tem rotina (Fase 20) tambem abre porta; a lista vem de `rotinas`, abaixo
const genteNasPortas = [];
cena.antesDeRenderizar.push((dt) => {
  const d = interiores.atualizar(cena.camera, dt, genteNasPortas);
  if (d !== dentroDePredio) { dentroDePredio = d; noite.dentro(d); }
});

/* Contencao, caixa coletora e area de guindaste na laje (Fase 4); faixas de
 * saque e caimento so na vista de planta. */
const areaProcesso = criarAreaProcesso();
areaProcesso.rotulosPlanta.visible = false;
cena.scene.add(areaProcesso.grupo);


/* ==========================================================================
 *  TUBULACAO
 *  Depois dos equipamentos: as linhas partem das ancoras de bocal ja
 *  posicionadas no mundo.
 * ======================================================================= */
const tubulacao = criarTubulacao(todos);
cena.scene.add(tubulacao.grupo);

/* Pipe rack no corredor central: comprimento, largura e porticos saem das
 * rotas — quantas linhas correm nele e onde cada uma entra e sai. */
const pipeRack = criarPipeRack(tubulacao.rack);
cena.scene.add(pipeRack);

/* Valvulas de controle e instrumentos de campo (Fase 6): montam sobre as
 * linhas ja tracadas e sobre os vasos. */
const instrumentacao = criarInstrumentacao({ todos, tubulacao });
cena.scene.add(instrumentacao.grupo);

/* Valvulas de seguranca do R-01 e do V-01 (Fase 8), com a descarga: entram na
 * camada de valvulas e na auditoria dela. */
const alivio = criarAlivio({ todos, tubulacao });
instrumentacao.grupo.add(alivio.grupo);
instrumentacao.achados.push(...alivio.achados);

/* Bloqueio no limite de bateria (Fase 18, pendencia O): gaveta e raquete em
 * cada linha que sai da unidade, com a plataforma de operacao. */
const bloqueio = criarBloqueioLimite({ tubulacao });
cena.scene.add(bloqueio.grupo);
instrumentacao.achados.push(...bloqueio.achados);

/* TAG pintada no costado de cada equipamento, na face livre de bocal, tubo e
 * escada — depois da tubulacao e dos instrumentos, que sao o que cobre. */
const pinturas = pintarTags({ todos, obstaculos: [tubulacao.grupo, instrumentacao.grupo, pipeRack] });

/* Pipeways (Fase 7): as linhas seguem das flanges de limite de bateria ate
 * tanques, torre, caldeira e armazem, com as bombas que o P&ID nao traz. */
const pipeways = criarPipeways({ tubulacao, entorno });
cena.scene.add(pipeways.grupo);

/* Faixas de identificacao (Fase 25, NBR 6493): o corpo do tubo tem a cor da
 * norma e o fluido se le pelos aneis da cor dele, dentro e fora da area. */
cena.scene.add(criarFaixas([tubulacao.grupo, pipeways.grupo], { cores: FAIXAS, ...FAIXA }));
// e a tinta dos tubos tem grao (Fase 25): material de cada linha, uma vez
{
  const pintados = new Set();
  for (const g of [tubulacao.grupo, pipeways.grupo]) {
    g.traverse((o) => { const m = o.material; if (m?.name?.startsWith('linha-') && !pintados.has(m)) { pintados.add(m); triplanar(m, 'tinta', 1.5); } });
  }
}

/* Seguranca (Fase 8): hidrantes, canhoes, lava-olhos, extintores e birutas
 * sempre a vista; zonas, distancias e rotas de fuga na camada do HUD. */
const seguranca = criarSeguranca({ todos, tubulacao, instrumentacao, entorno, pipeways, alivio });
cena.scene.add(seguranca.grupo);

/* Iluminacao da laje (Fase 26): luminarias Ex no rack e nas plataformas e
 * os mastros de projetores — antes da noite, que acende a lente pelo nome. */
const iluminacaoLaje = criarIluminacaoLaje({
  rack: tubulacao.rack,
  raizes: [...Object.values(todos).map((e) => e.grupo).filter(Boolean), bloqueio.grupo],
  obstaculos: [pipeways.grupo, seguranca.grupo],
  cena: cena.scene,
});
cena.scene.add(iluminacaoLaje.grupo);

/* Ambientacao (Fase 9): arvores, postes, carros, pessoas, placa e o trafego
 * animado, que liga e desliga no HUD. */
const ambiente = criarAmbiente({ entorno, pipeways, seguranca, tubulacao, chao: implantacao.chao });
cena.scene.add(ambiente.grupo);
let trafego = true;
// o passeio pausado (Fase 22) congela o mundo junto, como um video
const animarMundo = () => trafego && !passeio.congelado;
cena.antesDeRenderizar.push((dt) => { if (animarMundo()) ambiente.atualizar(dt); });
// vento (Fase 27): copas e birutas
const vento = criarVento({ seguranca });
cena.antesDeRenderizar.push((dt) => { if (animarMundo()) vento.atualizar(dt); });
// plumas da torre, da chamine e do vent, e o ventilador da torre (Fase 27);
// a noite so existe mais abaixo: a pluma le o k dela quando houver
const animacoes = criarAnimacoes({ cena, entorno, tubulacao, todos, seguranca });
cena.scene.add(animacoes.grupo);
// mastros de bandeira na frente da ADM (Fase 27, item 24): depois das arvores
cena.scene.add(criarBandeiras({ ambiente }));
cena.antesDeRenderizar.push((dt) => { if (animarMundo()) animacoes.atualizar(dt, window.__maquete?.noite?.k ?? 0); });
cena.antesDeRenderizar.push(() => ambiente.distanciaPessoas(cena.camera));

/* Pessoas com rotina (Fase 20): agenda ciclica por papel, entre os lugares
 * dos moveis, pelas portas, calcadas e corredores da laje. */
const rotinas = criarRotinas({ interiores, tubulacao, ambiente, instrumentacao, todos });
cena.scene.add(rotinas.grupo);
cena.antesDeRenderizar.push((dt) => {
  if (!animarMundo()) return;
  rotinas.atualizar(dt, cena.camera, window.__maquete?.noite?.k ?? 0);
  genteNasPortas.length = 0;
  genteNasPortas.push(...rotinas.posicoes);
});

/* Operacoes animadas (Fase 21): descarga de tolueno, carregamento do bau
 * com a porta de enrolar e a empilhadeira, portas do onibus. Depois do
 * trafego, que diz em que segundo da espera cada veiculo esta. */
const operacoes = criarOperacoes({ ambiente, entorno, interiores, cena });
cena.scene.add(operacoes.grupo);
cena.antesDeRenderizar.push((dt) => { if (animarMundo()) operacoes.atualizar(dt); });

/* Passeio automatico (Fase 22): aperta-se G (ou o botao view do controle)
 * e assiste-se; Esc ou G de novo param. Espaco pausa, as setas pulam de
 * parada. */
const passeio = criarPasseio({ cena, todos, tubulacao, entorno, interiores, ambiente, rotinas, operacoes });
cena.antesDeRenderizar.push((dt) => {
  passeio.atualizar(dt);
  // o botao fica aceso enquanto o passeio anda (Esc o para por dentro)
  ui.botoes.passeio?.classList.toggle('ativo', passeio.ativo);
});

/* Furo no piso da plataforma do R-01 onde uma linha a atravessa: as que
 * correm coladas ao costado (vapor de topo, reciclo, saida da camisa). */
{
  const r01 = todos['R-01'];
  const c = r01.grupo.getWorldPosition(new THREE.Vector3());
  const { y, r1, r2 } = r01.plataforma;
  const angulos = [];
  for (const pts of tubulacao.caminhos) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (Math.min(a.y, b.y) > y || Math.max(a.y, b.y) < y) continue;
      if (Math.hypot(a.x - b.x, a.z - b.z) > 0.01) continue;      // so trecho vertical
      const r = Math.hypot(a.x - c.x, a.z - c.z);
      if (r > r1 - 0.1 && r < r2 + 0.1) {
        // a plataforma conta o angulo no referencial do vaso: o do mundo mais
        // o giro (o R-01 gira 90° desde a Fase 11)
        const mundo = THREE.MathUtils.radToDeg(Math.atan2(a.z - c.z, a.x - c.x));
        angulos.push(mundo + THREE.MathUtils.radToDeg(r01.grupo.rotation.y));
      }
    }
  }
  if (angulos.length) r01.furarPlataforma(angulos);
}

/* ==========================================================================
 *  CAMERA
 * ======================================================================= */
function enquadrarTudo() {
  const caixa = new THREE.Box3();
  for (const t of Object.keys(todos)) {
    caixa.union(new THREE.Box3().setFromObject(todos[t].grupo));
  }
  cena.controls.enquadrarCaixa(caixa, 1.15);
}
function enquadrarEquip(tag) {
  cena.enquadrar(todos[tag].grupo, 1.3);
}
enquadrarTudo();

/* O corte em secao saiu com o painel de exibicao (16/11/2026; o comando
 * ficava la). O `alvoCorte` segue como o equipamento em foco. */
let alvoCorte = 'R-01';

/* ==========================================================================
 *  ANIMACAO DO AGITADOR
 * ======================================================================= */
let animando = true;
const girante = equip.camadas.agitador?.userData?.girante;
const velocidade = (R01.geom.agitador.rotacao / 60) * Math.PI * 2;
cena.antesDeRenderizar.push((dt) => {
  if (!animando || passeio.congelado) return;
  if (girante) girante.rotation.y += velocidade * dt;
  for (const t of tambores) t.grupo.rotation.z += t.w * dt;
});

/* ==========================================================================
 *  INTERFACE
 * ======================================================================= */
/* Pontos de vista prontos (Fase 10): a camera voa ate eles. */
function voarCaixa(caixa, margem = 1.15) {
  const c = cena.camera;
  const tam = caixa.getSize(new THREE.Vector3());
  const centro = caixa.getCenter(new THREE.Vector3());
  const dist = (Math.max(tam.x, tam.y, tam.z) / 2) / Math.tan((c.fov * Math.PI) / 360) * margem;
  cena.controls.voarPara(centro.clone().addScaledVector(new THREE.Vector3(0.75, 0.38, 0.9).normalize(), dist), centro);
}
let vistaAtual = -1;
function irParaVista(id) {
  const i = VISTAS.findIndex((v) => v.id === id);
  const v = VISTAS[i];
  if (!v) return;
  vistaAtual = i;
  if (v.planta) { if (!planta.ativa) planta.alternar(); return; }
  if (planta.ativa) planta.alternar();
  if (v.processo) {
    const caixa = new THREE.Box3();
    for (const t of Object.keys(todos)) caixa.union(new THREE.Box3().setFromObject(todos[t].grupo));
    voarCaixa(caixa);
    return;
  }
  cena.controls.voarPara(new THREE.Vector3(...v.pos), new THREE.Vector3(...v.alvo));
}

/* O 'Ir para' da Exibicao, por zona; o direcional do controle percorre na
 * mesma ordem. */
const IR_PARA = [
  { zona: 'Processo', itens: [
    { tag: 'CP-01', nome: 'Compressor de ar' },
    { tag: 'R-01', nome: 'Reator de oxidação' },
    { tag: 'E-01', nome: 'Condensador' },
    { tag: 'V-01', nome: 'Separador gás-líquido' },
    { tag: 'V-02', nome: 'Separador líquido-líquido' },
    { tag: 'TK-01', nome: 'Tanque de tolueno' },
    { tag: 'T-01', nome: 'Vaso flash (stripper)' },
    { tag: 'E-04', nome: 'Condensador do flash' },
    { tag: 'E-02', nome: 'Pré-aquecedor' },
    { tag: 'E-03', nome: 'Trocador de integração' },
    { tag: 'CR-01', nome: 'Cristalizador 1' },
    { tag: 'F-01', nome: 'Filtro rotativo 1' },
    { tag: 'D-01', nome: 'Dissolvedor' },
    { tag: 'CR-02', nome: 'Cristalizador 2' },
    { tag: 'F-02', nome: 'Filtro rotativo 2' },
  ] },
  { zona: 'Utilidades', itens: [
    { tag: 'torre', rotulo: 'Torre', nome: 'Resfriamento' },
    { tag: 'caldeira', rotulo: 'Caldeira', nome: 'Vapor e ar' },
    { tag: 'casa-subestacao', rotulo: 'Subestação', nome: 'Energia' },
    { tag: 'TQ-AI', rotulo: 'Incêndio', nome: 'Água e bombas' },
    { tag: 'casa-eta', rotulo: 'ETA', nome: 'Água tratada' },
    { tag: 'casa-ete', rotulo: 'ETE', nome: 'Efluentes' },
  ] },
  { zona: 'Armazenagem', itens: [
    { tag: 'TQ-01', rotulo: 'Tanques', nome: 'Tolueno e purga' },
    { tag: 'laje-descarga', rotulo: 'Descarga', nome: 'Caminhão-tanque' },
    { tag: 'predio-ARMAZEM', rotulo: 'Armazém', nome: 'Produto' },
  ] },
  { zona: 'Apoio', itens: [
    { tag: 'predio-CONTROLE', rotulo: 'Controle', nome: 'Sala de controle' },
    { tag: 'predio-LAB', rotulo: 'Laboratório', nome: 'Análises' },
    { tag: 'predio-OFICINA', rotulo: 'Oficina', nome: 'Almoxarifado' },
    { tag: 'predio-ADM', rotulo: 'ADM', nome: 'Administração' },
    { tag: 'predio-REFEITORIO', rotulo: 'Refeitório', nome: 'Vestiário' },
    { tag: 'predio-BRIGADA', rotulo: 'Brigada', nome: 'Ambulatório' },
    { tag: 'predio-PORTARIA', rotulo: 'Portaria', nome: 'Acesso' },
    { tag: 'abrigo-onibus', rotulo: 'Ônibus', nome: 'Ponto e abrigo' },
  ] },
];

/* O croqui oficial na ficha saiu com o painel da ficha. */

/* Legenda das cores dos tubos (Fase 25): tecla C ou botao Cores. */
const legendaTubos = criarLegendaTubos(container);
// setas do P&ID correndo nos tubos (Fase 27, item 6): ligam com a legenda
const setas = criarSetasTubos({ tubulacao });
cena.scene.add(setas.grupo);
cena.antesDeRenderizar.push((dt) => { if (animarMundo()) setas.atualizar(dt); });
// bussola no canto superior direito (Fase 25)
criarBussola(container, cena);

const ui = criarUI(container, {
  titulo: 'Planta de Ácido Benzóico',
  subtitulo: 'Benzoic Industries — maquete 3D navegável',
  vistas: VISTAS,
  aoVista: irParaVista,
  botoes: [{
    id: 'planta', rotulo: 'Planta', atalho: 'P', codigo: 'KeyP',
    titulo: 'Vista de planta do terreno, norte para cima — tecla P',
    aoClicar: () => planta.alternar(),
  }, {
    id: 'passeio', rotulo: 'Passeio', atalho: 'G', codigo: 'KeyG',
    titulo: 'Passeio automático pela planta: aperte e assista — tecla G (Espaço pausa, ← → pulam de parada, Esc para)',
    aoClicar: () => { trafego = true; passeio.alternar(); },
  }, {
    id: 'noite', rotulo: 'Noite', atalho: 'N', codigo: 'KeyN',
    titulo: 'Dia e noite: postes, janelas, refletores e balizamento acesos — tecla N',
    aoClicar: () => noite.alternar(),
  }, {
    id: 'cores', rotulo: 'Cores', atalho: 'C', codigo: 'KeyC',
    titulo: 'Legenda das cores da tubulação (NBR 6493) — tecla C',
    aoClicar: () => { legendaTubos.alternar(); setas.ligar(legendaTubos.aberta); ui.botoes.cores?.classList.toggle('ativo', legendaTubos.aberta); },
  }, {
    id: 'companion', rotulo: 'Companion', atalho: 'M', codigo: 'KeyM',
    titulo: 'Chama (ou dispensa) um acompanhante que segue você no modo andar, a 2–3 m — tecla M',
    aoClicar: () => { companheiro.chamar(); ui.botoes.companion?.classList.toggle('ativo', companheiro.chamado); },
  }, ...LOCALIZAR.map((v) => ({
    id: `achar-${v.chave}`, rotulo: v.rotulo, atalho: v.tecla, codigo: `Key${v.tecla}`,
    titulo: `Leva a câmera até o ${v.nome}, onde ele estiver — tecla ${v.tecla}`,
    aoClicar: () => localizarVeiculo(v),
  }))],
  aoFocar: (tag) => focar(tag),
});

/** Leva a camera, na hora, ate um veiculo do trafego (os botoes da barra).
 *  Fora de cena nao ha o que mostrar: diz em quanto tempo ele volta. */
function localizarVeiculo(v) {
  if (planta.ativa || passeio.ativo) return;
  const a = ambiente.atores.find((x) => x.chave === v.chave);
  if (!a) return;
  if (!a.g.visible) {
    // tempo ate o fim da fase em que ele esta (a `fora`)
    let fim = 0;
    for (let i = 0; i <= a.fase; i++) fim += a.fases[i]?.T ?? 0;
    const falta = Math.max(0, Math.ceil(fim - a.t));
    ui.avisar(a.retido || a.fase < 0 ? `${v.nome}: fora da planta agora` : `${v.nome}: fora da planta, volta em ${falta} s`);
    return;
  }
  cena.enquadrar(a.g, 1.7);
  ui.avisar(v.nome);
}

/** Leva a camera a um equipamento (ou predio do entorno). */
function focar(tag) {
  {
    // Predio ou utilidade do entorno: so enquadra.
    if (!todos[tag]) {
      const o = entorno.objetos.find((x) => x.nome === tag);
      if (o) cena.enquadrar(o.grupo, 1.4);
      return;
    }
    alvoCorte = tag;
    enquadrarEquip(tag);
  }
}


/* Vista de planta: a camera sobe, olha para baixo com o norte em cima, e as
 * etiquetas dos blocos e as cotas de distancia aparecem. As etiquetas nascem
 * ocultas, mas na planta sao a legenda: acendem ao entrar e voltam ao que
 * estavam ao sair. */
let etiquetasAntesDaPlanta = null;
const planta = criarVistaPlanta(cena, {
  limites: implantacao.limites,
  aoMudar: (ligada) => {
    if (ligada) {
      etiquetasAntesDaPlanta = ui.ligada('rotulos3d');
      ui.alternarPeca('rotulos3d', true);
    } else if (etiquetasAntesDaPlanta !== null) {
      ui.alternarPeca('rotulos3d', etiquetasAntesDaPlanta);
      etiquetasAntesDaPlanta = null;
    }
    implantacao.rotulosPlanta.visible = ligada;
    implantacao.pintarLegenda(ligada);
    pipeways.rotulosPlanta.visible = ligada;
    areaProcesso.rotulosPlanta.visible = ligada;
    ui.botoes.planta?.classList.toggle('ativo', ligada);
  },
});

/* A oclusao de ambiente (GTAO, core/realismo.js) saiu da maquete em
 * 16/11/2026: era o efeito mais caro por pixel e, na maquina de trabalho, ja
 * se desligava sozinha por desempenho. O modulo continua em core/, sem
 * ninguem importar; para religar, `criarRealismo(cena, { aoMudar })` aqui. */

/* A camada de projeto da seguranca (zonas, distancias, rotas de fuga) ficava
 * oculta e so o painel de exibicao a acendia: sai da cena. Hidrantes,
 * canhoes, extintores e lava-olhos continuam; `seguranca.camada` segue
 * existindo para a auditoria. */
seguranca.camada.removeFromParent();

/* Modo noite (Fase 24): tecla N. Monta refletores, estrelas e pocas de luz
 * na primeira noite; o botao fica aceso enquanto e noite. */
const noite = criarNoite({
  cena, ambiente, entorno, tubulacao, interiores, iluminacao: iluminacaoLaje.grupo,
  aoMudar: (v) => ui.botoes.noite?.classList.toggle('ativo', v),
});
// os shaders da noite compilam em segundo plano, depois que a cena assenta
setTimeout(() => noite.preparar(), 6000);

/* ==========================================================================
 *  DESEMPENHO (Fase 10): sombra so onde importa e o detalhe estatico de cada
 *  peca fundido por material — de ~4 700 malhas para algumas centenas, sem
 *  perder ficha, camada, corte nem realce (core/fundir.js). Depois de tudo
 *  montado e antes das etiquetas, que medem os volumes ja fundidos.
 * ======================================================================= */
// furo na chapa atras de cada visor de boca de visita (lib/furos.js), com
// tudo ja posto e antes de fundir
registrarFuros(cena.scene);
// passaros (Fase 27, item 21): as caixas dos obstaculos saem da cena ainda
// sem fundir (fundida, uma malha vira a planta inteira)
const passaros = criarPassaros({ cena });
// pecas com relogio proprio (Fase 27, item 22): a ponte do raspador do
// decantador e o borbulhar do biologico (userData.animarTempo)
const comTempo = [];
cena.scene.traverse((o) => { if (o.userData.animarTempo) comTempo.push(o); });
let tempoMundo = 0;
cena.antesDeRenderizar.push((dt) => { if (!animarMundo()) return; tempoMundo += dt; for (const o of comTempo) o.userData.animarTempo(tempoMundo); });
cena.scene.add(passaros.grupo);
cena.antesDeRenderizar.push((dt) => { if (animarMundo()) passaros.atualizar(dt, window.__maquete?.noite?.k ?? 0); });

const fusao = new URLSearchParams(location.search).has('semfusao') ? { desligada: true } : (() => {
  const t0 = performance.now();
  const sombras = podarSombras(cena.scene);
  const girantes = new Set([girante, ...tambores.map((t) => t.grupo)].filter(Boolean));
  let antes = 0, depois = 0;
  // (objeto do entorno e bloco da implantacao continuam uma unidade cada: a
  // noite, o "ir para" e as auditorias os procuram pela caixa)
  const porObjeto = new Set([entorno.grupo, implantacao.grupo]);
  for (const g of [
    ...Object.values(todos).map((e) => e.grupo), tubulacao.grupo, pipeRack, instrumentacao.grupo,
    pipeways.grupo, seguranca.grupo, entorno.grupo, implantacao.grupo, areaProcesso.grupo, bloqueio.grupo,
    iluminacaoLaje.grupo,
  ]) {
    const r = fundir(g, girantes, { fichas: porObjeto.has(g) ? 'filhos' : null });
    antes += r.antes;
    depois += r.depois;
  }
  return { antes, depois, sombrasPodadas: sombras, ms: Math.round(performance.now() - t0) };
})();

/* ==========================================================================
 *  ETIQUETAS
 *  Depois da UI: o gerenciador precisa da camada de rotulos ja registrada para
 *  saber quando ela esta desligada pela tecla L.
 * ======================================================================= */
function solidosDoEntorno() {
  const out = [];
  const t = new THREE.Vector3();
  for (const o of entorno.objetos) {
    if (/^cobertura|^bacia|^laje-descarga|^braco/.test(o.nome)) continue;
    o.grupo.updateWorldMatrix(true, true);
    o.grupo.traverse((m) => {
      if (!m.isMesh) return;
      // moveis nao ocluem etiqueta: a casca do predio ja faz isso
      for (let p = m.parent; p; p = p.parent) if (p.name === 'interior') return;
      const s = new THREE.Box3().setFromObject(m).getSize(t);
      if (Math.min(s.x, s.y, s.z) > 0.5) out.push(m);   // so o que e macico
    });
  }
  return out;
}
const gerenteRotulos = criarGerenciadorRotulos({
  camera: cena.camera,
  container,
  camadaDOM: cena.labelRenderer.domElement,
  // Ocluem etiqueta: os equipamentos (uma caixa cada) e os volumes solidos do
  // entorno — predio, costado de tanque, torre, caldeira, chamine —, uma caixa
  // por malha. Tubulacao, estrutura, cobertura aberta, escada e guarda-corpo
  // nao entram: sao vazados, e um raio que passa raspando num tubo de DN 50
  // apagaria a TAG inteira — o piscar que se quer evitar.
  obstaculos: [...Object.values(todos).map((e) => e.grupo), ...solidosDoEntorno()],
});
gerenteRotulos.sincronizar(cena.scene);
// No gancho DOS ROTULOS, nao no de animacao: precisa da camera ja atualizada.
// (so com a camada a vista — a vista de planta: fora dela nao se calcula nada)
cena.antesDosRotulos.push(() => { if (ui.ligada('rotulos3d')) gerenteRotulos.atualizar(); });

window.__maquete = {
  cena, equipamentos, todos, tubulacao, instrumentacao, iluminacaoLaje, animacoes, mapaPedestre, entorno, interiores, pipeways, seguranca, ambiente, rotinas, operacoes, passeio, noite, pinturas, fusao,
  gerenteRotulos, setas, passaros,
  implantacao, planta,
  get alvoCorte() { return alvoCorte; },
};

/* Auditoria geometrica — so em desenvolvimento, nao vai para o entregavel.
 * No console: __auditar() para a planta inteira, __auditar('F-01') para um. */
if (import.meta.env.DEV) {
  // THREE exposto so em DEV: sem isso nao da para reproduzir um raycast na mao
  // no console, e diagnostico de bocal e de interferencia vive disso.
  window.__THREE = THREE;
  import('./dev/implantacao.js').then(({ auditarImplantacao }) => {
    window.__auditarImplantacao = () => auditarImplantacao();
  });
  import('./dev/entorno.js').then(({ auditarEntorno }) => {
    window.__auditarEntorno = () => auditarEntorno({ objetos: entorno.objetos, pipeways });
  });
  import('./dev/chao.js').then(({ auditarChao }) => {
    window.__auditarChao = () => auditarChao({ scene: cena.scene, chao: implantacao.chao });
  });
  import('./dev/interiores.js').then(({ auditarInteriores }) => {
    window.__auditarInteriores = () => auditarInteriores({ interiores });
  });
  // ronda de inspecao visual: postos com camera e o que olhar em cada um
  import('./dev/inspecao.js').then(({ criarInspecao }) => {
    window.__inspecao = criarInspecao({ cena, todos, entorno, interiores, ambiente, planta });
  });
  window.__auditarPasseio = (tudo) => passeio.auditar(tudo);
  import('./dev/hidraulica.js').then(({ auditarHidraulica }) => { window.__auditarHidraulica = () => auditarHidraulica({ tubulacao, pipeways }); });
  import('./dev/apoios.js').then(({ auditarApoios }) => { window.__auditarApoios = () => auditarApoios(todos); });
  import('./dev/contato.js').then(({ auditarContato }) => { window.__auditarContato = () => auditarContato({ cena, todos, tubulacao }); });
  import('./dev/iluminacao.js').then(({ auditarIluminacao }) => { window.__auditarIluminacao = () => auditarIluminacao({ cena, ambiente, todos }); });
  import('./site/pedestres.js').then(({ auditarPedestres, mapaPedestre }) => { window.__auditarPedestres = auditarPedestres; window.__mapaPedestre = mapaPedestre; });
  window.__auditarPassaros = (seg, sementes) => passaros.auditar(seg, sementes);
  window.__auditarOperacoes = () => {
    const porRegra = {};
    for (const a of operacoes.achados) (porRegra[a.regra] ??= []).push(a);
    return { total: operacoes.achados.length, porRegra, achados: operacoes.achados };
  };
  window.__auditarRotinas = () => {
    const porRegra = {};
    for (const a of rotinas.achados) (porRegra[a.regra] ??= []).push(a);
    return { total: rotinas.achados.length, porRegra, achados: rotinas.achados, resumo: rotinas.resumo };
  };
  window.__auditarAmbiente = () => {
    const porRegra = {};
    for (const a of ambiente.achados) (porRegra[a.regra] ??= []).push(a);
    return { total: ambiente.achados.length, porRegra, achados: ambiente.achados, resumo: ambiente.resumo };
  };
  window.__auditarSeguranca = () => {
    const porRegra = {};
    for (const a of seguranca.achados) (porRegra[a.regra] ??= []).push(a);
    const { achados, cobertura, contagem, rotas } = seguranca;
    return { total: achados.length, porRegra, achados, cobertura, contagem, rotas };
  };
  import('./dev/arranjo.js').then(({ auditarArranjo }) => {
    window.__auditarArranjo = () => auditarArranjo({ todos, rack: tubulacao.rack, tubulacao, instrumentacao });
  });
  import('./dev/otimizador.js').then((o) => {
    window.__otimizarArranjo = (op) => {
      const med = o.medir(todos);
      const sol = op?.sol ?? o.otimizar(med, op);
      const proposta = o.montar(sol, med);
      const r = { sol, proposta, custo: o.custo(proposta), atual: o.custo(o.arranjoAtual(med)) };
      window.__ultimaProposta = r;
      return r;
    };
    // Planta da proposta por cima da cena (clique para fechar); devolve o SVG.
    window.__plantaProposta = (op) => {
      const r = op?.sol ? op : (window.__ultimaProposta ?? window.__otimizarArranjo(op));
      const atual = o.arranjoAtual(r.proposta.med);
      const svg = o.desenhar(r.proposta, {
        custoNovo: r.custo,
        atual: {
          c: r.atual, d: o.diagnosticar(atual),
          dim: [atual.laje.x1 - atual.laje.x0, atual.laje.z1 - atual.laje.z0],
          dCP: Math.hypot(atual.itens['CP-01'].x - atual.itens['R-01'].x, atual.itens['CP-01'].z - atual.itens['R-01'].z),
        },
      });
      document.querySelector('.planta-proposta')?.remove();
      const div = document.createElement('div');
      div.className = 'planta-proposta';
      div.style.cssText = 'position:fixed;inset:0;z-index:50;overflow:auto;background:#1d232b;';
      div.innerHTML = svg;
      div.onclick = () => div.remove();
      document.body.appendChild(div);
      return svg;
    };
  });
  import('./dev/auditoria.js').then(({ auditar }) => {
    window.__auditar = (filtro) => auditar(
      { todos, tubulacao, instrumentacao, rack: pipeRack, scene: cena.scene }, filtro,
    );
    console.info('auditoria pronta — rode __auditar()');
  });
}

/* ==========================================================================
 *  CONTROLE DE XBOX (Fase 10)
 *  Andar, voar e olhar ficam em core/controls.js (A e B sao de la: pular,
 *  subir, descer); aqui, o que cada um dos outros botoes faz no HUD.
 * ======================================================================= */
const tagsIrPara = IR_PARA.flatMap((z) => z.itens.map((it) => it.tag));
let focoControle = -1;
/* Companion: segue a camera no modo andar (site/companheiro.js). Entra na
 * cena depois da fusao; e peca que se mexe. */
const companheiro = criarCompanheiro({ cena, avisar: (t) => ui.avisar(t) });
cena.scene.add(companheiro.grupo);
cena.antesDeRenderizar.push((dt) => companheiro.atualizar(dt));
// o braco em primeira pessoa: andando, o RT ergue e aponta (site/braco.js)
const braco = criarBraco({ cena });
cena.antesDeRenderizar.push((dt) => braco.atualizar(dt));
cena.controls.aoModo = (andando) => ui.avisar(companheiro.chamado && andando ? 'Andando — o companion vem atrás' : andando
  ? 'Andando — A ou Espaço pula · duas vezes: voar'
  : 'Voando — A sobe, B desce · A ou Espaço duas vezes: andar');
cena.controls.aoBotao = (b) => {
  // no passeio, A pausa, LB/RB e o direcional pulam de parada, B sai
  if (passeio.botao(b)) return;
  if (b === 'Y') ui.alternarTudo();
  else if (b === 'X') { companheiro.chamar(); ui.botoes.companion?.classList.toggle('ativo', companheiro.chamado); }
  else if (b === 'LB' || b === 'RB') {
    const i = (vistaAtual + (b === 'RB' ? 1 : -1) + VISTAS.length) % VISTAS.length;
    irParaVista(VISTAS[i].id);
  } else if (['cima', 'baixo', 'esquerda', 'direita'].includes(b)) {
    const passo = b === 'direita' || b === 'baixo' ? 1 : -1;
    focoControle = (focoControle + passo + tagsIrPara.length) % tagsIrPara.length;
    focar(tagsIrPara[focoControle]);
  } else if (b === 'start') ui.alternarPeca('dica');
  else if (b === 'view') { trafego = true; passeio.alternar(); }
};
