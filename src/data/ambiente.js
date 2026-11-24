import { BLOCOS, PORTOES, ROTAS_CAMINHAO, CALCADAS, LOTE, PRACA_PORTARIA, ONIBUS, VIAS, FAIXA_VEICULO, GIRO_CAMINHAO, VEICULOS } from './site.js';
import { arco, deslocar, dirPlana } from '../lib/plano.js';
import { posicaoBracos, ENTRADA_GARAGEM } from './entorno.js';
import { RACK, CORREDORES, ARRANJO } from './arranjo.js';

// o corredor transversal mais largo e o do reator (3 m, as escadas descem nele)
const corrReator = [...CORREDORES].sort((a, b) => (b.x[1] - b.x[0]) - (a.x[1] - a.x[0]))[0];
const bombasN = ARRANJO.filter((a) => /^BC-/.test(a.tag) && a.z < RACK.z).map((a) => a.x);
const [bombasX0, bombasX1] = [Math.min(...bombasN), Math.max(...bombasN)];

/**
 * ============================================================================
 *  AMBIENTACAO
 * ============================================================================
 *
 *  Pouca coisa e barata: arvores, postes de iluminacao, carros, figuras
 *  humanas, a placa na entrada e o trafego animado. Tudo [ADOTADO]. O que se
 *  repete vai em InstancedMesh (site/ambiente.js); a posicao sai da regra e
 *  do lugar livre, como na Fase 8.
 * ============================================================================
 */

const bloco = (id) => BLOCOS.find((b) => b.id === id);

/* Arvores: copa media, especie nativa (ipe, oiti). Nunca a menos de 15 m de
 * processo, tanques e descarga: vegetacao nao leva fogo ate area de risco
 * (pratica de implantacao; a confirmar com a IT do CBPMESP). */
export const ARVORES = {
  afastamentoRisco: 15,
  riscos: ['processo', 'tanques', 'carga'],
  // fileiras dentro de cada bloco: margem da borda e passo ao longo dele
  fileiras: [
    { bloco: 'VERDE', margem: 2, passo: 9, alternar: true },
    { bloco: 'ESTAC', margem: 1.6, passo: 10, bordas: ['norte', 'sul'] },
  ],
  escala: [0.8, 1.25],
  /* Fase 14, no gramado da regra CHAO (nunca na brita):
   *   alinhamento  ao longo das calcadas, dos dois lados, a cada 10 m e
   *                2,5 m fora da borda: a copa sombreia a calcada e nao cai
   *                na pista [ADOTADO]
   *   bosque       nos gramados grandes, grade de 14 m com ate 6 m de
   *                sorteio e 20 % das celulas vazias, a 4 m de qualquer
   *                piso [ADOTADO]
   *   espaco       entre troncos, nunca menos de 7 m [ADOTADO] */
  alinhamento: { passo: 10, afastamento: 2.5 },
  // Fase 18: com 3 m de sorteio a grade aparecia (parecia pomar); 6 m e uma
  // celula em cada cinco vazia, e ela some, sem amontoar arvore
  bosque: { passo: 14, sorteio: 6, folga: 4, vazias: 0.2 },
  espaco: 7,
  // faixa sem arvore diante do letreiro de cada predio (Fase 15) [ADOTADO]
  vista: 15,
  // o gramado da frente, entre a cerca e a calcada publica, tambem recebe
  frente: { x: LOTE.x, z: [LOTE.z[1], LOTE.z[1] + 13] },
};

/* Canteiro de arbustos junto da fachada dos predios de gente (Fase 14)
 * [ADOTADO]: a 0,8 m da parede, um a cada 1,6 m; a porta, o portao e a doca
 * ficam livres (4 m de cada lado do meio da fachada deles). */
export const CANTEIROS = { usos: ['ocupado', 'controle', 'apoio'], afastamento: 0.8, passo: 1.6, vaoPorta: 4 };

/* Iluminacao (postes de via, de pedestre e de estacionamento): desde a
 * Fase 26 em data/iluminacao.js — alvo, luminaria e regra de colocacao. */

/* Ceu (Fase 25, pedido do autor: "coloque umas nuvens no ceu para ficar
 * mais realista") [ADOTADO, parametros de desenho]: cumulos de tempo bom,
 * procedurais no shader do ceu (nenhuma imagem), andando devagar com o
 * vento. `cobertura` e o limiar do ruido (mais alto, menos nuvem: ~0,5 da
 * um ceu "poucas nuvens"); `escala`, quantas nuvens cabem no ceu; `vento`,
 * quanto o desenho anda por segundo. */
export const CEU = {
  nuvens: { cobertura: 0.5, escala: 0.75, vento: [0.006, 0.0025], cor: 0xffffff, sombra: 0xa9b6c4, opacidade: 0.92 },
};

/* Plumas (Fase 27, itens 2 e 3) [ADOTADO, parametros de desenho]: ar umido
 * saturado da torre (sai a ~8 m/s, condensa e some em 10-20 m), gases da
 * caldeira a gas (quase invisiveis: um veu leve) e o vent dos incondensaveis
 * (um fio). `taxa` particulas/s, `vida` s, `sobe` m/s, `abre` m/s de
 * crescimento do diametro, `d0` diametro na saida (m), `alfa` opacidade
 * maxima; o vento de projeto leva a pluma (`deriva` m/s).
 * Ventilador da torre: ~180 rpm de verdade; desenhado a 50 rpm para nao
 * estroboscopar a 60 quadros por segundo. */
export const PLUMAS = {
  deriva: 2.2,
  torre: { taxa: 8, vida: 6, sobe: 2.2, abre: 1.1, d0: 2.6, alfa: 0.32, cor: 0xf2f4f6 },
  chamine: { taxa: 5, vida: 6, sobe: 1.8, abre: 0.5, d0: 0.6, alfa: 0.18, cor: 0xd9dcdf },
  vent: { taxa: 3, vida: 3, sobe: 1.2, abre: 0.3, d0: 0.15, alfa: 0.25, cor: 0xf0f2f4 },
  rpmVentilador: 50,
  // teste do canhao monitor (item 15): um de cada vez, `duracao` s a cada
  // `periodo` s (o teste e semanal; aqui acelerado para se ver). Jato a 30°
  // com 22 m/s de saida -> alcance ~40 m sem arrasto [ESTIMADO: monitor de
  // 1 000 L/min a 7 bar, 40-50 m]; o arrasto encurta (`arrasto` 1/s)
  jato: { v0: 22, arrasto: 0.25, periodo: 300, duracao: 40, n: 700, d: [0.25, 1.1], alfa: 0.35, cor: 0xdfeef8 },
  // ponte rolante da oficina (item 23): translacao e direcao do carro, m/s
  // [ADOTADO: ponte de oficina de 5 t, 20 m/min e 10 m/min]
  ponteRolante: { ponte: 0.33, carro: 0.17 },
  // bolhas de ar do sparger do R-01 (item 5): sobem a ~0,3 m/s [ESTIMADO:
  // bolha de 3-6 mm em liquido agitado, 0,2-0,35 m/s], de 3 a 8 cm
  // desenhadas (a de verdade nao se veria); `n` bolhas no liquido
  bolhas: { n: 320, sobe: 0.3, d: [0.05, 0.12], alfa: 0.75, cor: 0xe8f2fa },
};

/* Noite (Fase 24) [ADOTADO, parametros de desenho]: o que acende e quanto.
 * Postes: lampada de sodio/LED quente; a "poca" de luz no chao tem o raio
 * de uma luminaria de via de 9 m (meia altura de montagem para cada lado,
 * NBR 5101 da a uniformidade, nao o raio). Refletores onde ha trabalho a
 * noite: a laje (nas pontas do rack, por cima), a baia de descarga e a
 * cobertura da portaria (sob o telhado), o portao do armazem e a
 * caldeira. Balizamento: luz vermelha piscando no ponto mais alto do que
 * se ve de longe (chamine da caldeira, castelo d'agua). */
export const NOITE = {
  transicao: 2.5,                                         // s do dia a noite
  ceu: { alto: 0x050a16, horizonte: 0x1a2436, baixo: 0x090d14 },
  neblina: 0x0e1520,
  estrelas: 1,                                            // brilho das estrelas (no shader do ceu)
  nuvem: { cor: 0x2a3342, sombra: 0x121821 },             // nuvem de noite: cinza escuro, um pouco mais clara que o ceu
  lua: { cor: 0x9fb4e6, intensidade: 0.35 },            // na direcao do sol: a sombra nao troca de lado
  hemi: { ceu: 0x4d6189, chao: 0x0a0c0f, intensidade: 0.14 },
  preenchimento: 0.04,
  reflexo: 0.25,                                          // o metal reflete o ceu escuro
  // lampada da sala em que a camera esta: iluminancia `e` (na unidade do
  // renderizador; o sol do dia vale 2,5) a meia diagonal da sala
  lampada: { cor: 0xfff3e0, e: 1.3 },
  luminaria: { cor: 0xffd29a, intensidade: 3.5 },
  poca: { raio: 11, cor: 0xffc77a, forca: 0.5 },
  // luz na laje (Fase 26): a iluminancia da grade de lib/fotometria.js vira
  // brilho — `eRef` lx satura (o alvo de bombas e instrumentos), `gama`
  // abre os tons baixos, passo da grade em m, LED neutro (4000 K)
  luzLaje: { eRef: 50, gama: 0.6, forca: 0.55, passo: 0.5, margem: 2, cor: 0xfff1dc },
  janela: { cor: 0xffcf88, intensidade: 0.5 },
  letreiro: 0.9, placa: 0.85, farol: 3, lanterna: 2.5,
  // cd, m, graus; sob telhado o facho e aberto e vai um a cada `vaoTeto` m
  refletor: { cor: 0xfff1d6, intensidade: 900, alcance: 70, abertura: 62, intensidadeTeto: 220, aberturaTeto: 130, vaoTeto: 12 },
  balizamento: { nomes: ['caldeira', 'eta-castelo'], cor: 0xff2a1a, periodo: 1.5 },
  // fotocelula (Fase 27, item 17): cada grupo de luminarias (um material
  // `luminaria` por grupo: postes, laje, os da Fase 26...) acende quando a
  // escuridao passa do limiar dele, num degrau de `rampa` — e nao todas
  // juntas, em fade, como lampada de cena
  fotocelula: { limiares: [0.42, 0.56, 0.68, 0.5, 0.62], rampa: 0.05, refletores: 0.6 },
};

/* Estacionamento: 60 % das vagas ocupadas, cores comuns de frota. */
export const CARROS = {
  ocupacao: 0.6,
  cores: [0xf2f2f2, 0xbfc3c7, 0x2b2e33, 0x8a1c1c, 0x24477a, 0x6d737a, 0xe8e2d6],
};

/* Placa da empresa na entrada: a direita de quem chega pela via publica,
 * no gramado por dentro da curva de entrada, fora da cerca, de frente para
 * a via. */
const portaria = PORTOES.find((p) => p.id === 'principal');
const { guarita } = PRACA_PORTARIA;
export const PLACA = { x: portaria.x + 22, z: LOTE.z[1] + 6, texto: 'BENZOIC INDUSTRIES', sub: 'Planta de Ácido Benzóico' };

/* Pessoas paradas, para escala: operadores na laje e no parque, o vigia na
 * portaria (o da baia de descarga anda desde a Fase 21: site/operacoes.js). Coordenadas no meio do lugar; a composicao as
 * empurra para o ponto livre mais perto. */
const desc = bloco('DESCARGA');
const [b1] = posicaoBracos(desc);
export const PESSOAS = [
  // o porteiro fica DENTRO da guarita (pedido do autor, 26/10); a
  // guarita de vidro, com ele a vista, e da Fase 15
  // de frente para a pista de entrada (+x), no piso da guarita (10 cm)
  { onde: 'vigia', x: (guarita.x[0] + guarita.x[1]) / 2 - 0.2, z: (guarita.z[0] + guarita.z[1]) / 2, dentro: true,
    rumo: Math.PI / 2, piso: 0.1, cor: 0x2b2e33 },
  // na laje, nos corredores (Fase 11): um no do rack, diante das bombas, e
  // outro no corredor do reator
  { onde: 'operador', x: (bombasX0 + bombasX1) / 2, z: RACK.z, cor: 0xf2a03d },
  { onde: 'operador', x: (corrReator.x[0] + corrReator.x[1]) / 2, z: (corrReator.z[0] + corrReator.z[1]) / 2, cor: 0xf2a03d },
  { onde: 'operador', x: -28, z: -77, cor: 0xf2a03d },
  { onde: 'operador', x: 23, z: -32, cor: 0xf2a03d },
];

/* ----------------------------------------------------------------------------
 *  TRAFEGO ANIMADO (ideia do autor, 22/10). Os percursos sao os de site.js:
 *  caminhoes pelas rotas de caminhao, pessoas pelas calcadas — a separacao
 *  pedestre x caminhao ja medida na Fase 3. Mao de direcao: a direita.
 *  Velocidades [ADOTADO]: 15 km/h dentro da cerca, 40 km/h na via publica.
 * ------------------------------------------------------------------------- */
const rota = (id) => ROTAS_CAMINHAO.find((r) => r.id === id).pontos;
const calcada = (id) => CALCADAS.find((c) => c.id === id).pontos;
const pOeste = calcada('portaria-oeste');
const vest = calcada('vestiario');
/* ----------------------------------------------------------------------------
 *  MANOBRAS DOS CAMINHOES (Fase 19). As duas rotas acabam em via sem saida;
 *  antes o caminhao dava meia-volta no lugar. Agora cada um entra de re onde
 *  descarrega ou carrega e sai de frente. Tudo na faixa da direita
 *  (FAIXA_VEICULO) e com o giro do caminhao (GIRO_CAMINHAO). Tres pernas:
 *  ida (de frente), manobra (de re) e saida (de frente).
 * ------------------------------------------------------------------------- */
const R = GIRO_CAMINHAO;
/** Tanque: passa do entroncamento da via da descarga, para e entra de re em
 *  arco, ate a parada entre os bracos de carga. */
function manobraTanque() {
  const tol = rota('tolueno');
  const J = tol.at(-2), fim = tol.at(-1);            // entroncamento e ponta da via da descarga
  const d = dirPlana(tol.at(-3), J);                 // rumo de quem chega
  const parada = [b1[0] + 4, desc.z[0] + 7];
  const ida = deslocar([...tol.slice(0, -1), [J[0] + d[0] * R, J[1] + d[1] * R]], FAIXA_VEICULO);
  const A = ida.at(-1);
  // de re: o rumo do movimento gira de `-d` para o da via da descarga
  const e = dirPlana(J, fim);
  const c = [A[0] + e[0] * R, A[1] + e[1] * R];       // centro do arco
  const a0 = (Math.atan2(A[1] - c[1], A[0] - c[0]) * 180) / Math.PI;
  const fimArco = [c[0] - d[0] * R, c[1] - d[1] * R];
  const a1 = (Math.atan2(fimArco[1] - c[1], fimArco[0] - c[0]) * 180) / Math.PI;
  // arco em passos de 1,5°: na troca de frente para re o rumo nao pula
  const manobra = [...arco(c[0], c[1], R, a0, a1, 1.5), parada];
  const saida = [parada, ...deslocar([...tol].reverse().slice(1), FAIXA_VEICULO)];
  return { ida, manobra, saida };
}
/** Bau: no patio de manobra (site.js), entra de frente virando para o norte
 *  e volta de re em arco ate a faixa do portao; dali, de re, ate a parada. */
function manobraBau() {
  const prod = rota('produto');
  const pat = VIAS.find((v) => v.id === 'patio-expedicao').pontos;
  const xEixo = (pat[0][0] + pat[1][0]) / 2;        // eixo do patio
  const x1 = xEixo + R;                             // onde comeca a virar
  const ida = deslocar([...prod.slice(0, -1), [x1, prod.at(-1)[1]]], FAIXA_VEICULO);
  const zl = ida.at(-1)[1];
  ida.push(...arco(x1, zl - R, R, 90, 180, 1.5).slice(1));
  const manobra = [...arco(x1 - 2 * R, zl - R, R, 0, 90, 1.5), ENTRADA_GARAGEM.parada];
  const volta = deslocar([...prod].reverse(), FAIXA_VEICULO);
  const saida = [ENTRADA_GARAGEM.parada, [xEixo - R / 2, zl], ...volta.filter((p) => p[0] > xEixo + R / 2)];
  return { ida, manobra, saida };
}

/** Companion (site/companheiro.js): fica entre `perto` e `longe` m de quem
 *  anda; vem a `andar` m/s (a velocidade do modo andar) e corre a `correr`
 *  se ficou para tras; alem de `sumiu` m reaparece atras da camera. [ADOTADO] */
export const COMPANION = {
  perto: 2, longe: 3, andar: 4.5, correr: 11, sumiu: 18,
  // a figura (pedido do autor, 16/11/2026): forte, camisa de listras
  // rubro-negras, cabelo preto, shorts azul-escuro e chinelo [ADOTADO]
  figura: { atletico: true, cabecaEscala: 1.18, listras: [0xc8102e, 0x111111], manga: 'curta', calca: 0x14213d, shorts: true, chinelo: 0x1a1a1a, capacete: null, cabelo: 0x0c0c0c },
};

/** O braco em primeira pessoa (pedido do autor, 24/11/2026: no modo andar,
 *  o LT do controle levanta o braco e aponta para a frente, como no
 *  Minecraft). Tudo no referencial da camera (m; x a direita, y para cima,
 *  -z para a frente). [ADOTADO] por enquadramento com fov de 50°: em
 *  repouso a mao fica uns 44° abaixo do centro (fora da tela); apontando,
 *  uns 7° abaixo, a caminho do centro.
 *  `ombro` e onde o braco gira; `giroRepouso`/`giroAponta` sao [x, y] em
 *  graus (x > 0 ergue a mao, y > 0 leva para a esquerda). */
export const BRACO = {
  ombro: [0.22, -0.2, -0.06],   // o cotovelo, na verdade: o braco de cima fica fora da tela
  // [ADOTADO] mao e antebraco de adulto (palma ~8 x 9 cm, indicador ~7 cm)
  mao: {
    antebraco: 0.27, raioCotovelo: 0.038, raioPunho: 0.027, manga: 0.1,
    palma: [0.078, 0.028, 0.09], indicador: 0.072, raioDedo: 0.0088,
  },
  pele: 0xd2a07c,
  camisa: 0x2f6f9f,
  giroRepouso: [-34, 6],
  giroAponta: [17, 4],
  subida: 14,                 // 1/s — rapidez com que levanta e abaixa
};

/** Botoes da barra que levam a camera ate um veiculo do trafego (`chave` e a
 *  do ator em site/ambiente.js; `tecla`, o atalho). [ADOTADO] */
export const LOCALIZAR = [
  { chave: 'tanque', rotulo: 'Tanque', nome: 'caminhão-tanque de tolueno', tecla: 'K' },
  { chave: 'bau', rotulo: 'Baú', nome: 'caminhão-baú de produto', tecla: 'B' },
  { chave: 'onibus', rotulo: 'Ônibus', nome: 'ônibus dos operários', tecla: 'O' },
];

export const TRAFEGO = {
  velocidade: { dentro: 15 / 3.6, fora: 40 / 3.6, pessoa: 1.3 },
  re: 5 / 3.6,                                   // manobra de re [ADOTADO]
  faixa: FAIXA_VEICULO,                          // eixo da via -> eixo do veiculo
  caminhoes: [
    // espera do tamanho da operacao de cada um (data/operacoes.js, Fase 21)
    { tipo: 'tanque', ...manobraTanque(), espera: 72, fora: 20, inicio: 0 },
    { tipo: 'bau', ...manobraBau(), espera: 64, fora: 35, inicio: 0.45 },
  ],
  // carros de passagem na via publica, nos dois sentidos
  carros: { via: 'publica', n: 4 },
  // pessoas indo e voltando pelas calcadas (indice em CALCADAS e trecho)
  pessoas: [
    // do estacionamento a frente dos predios, pela calcada da via principal
    { pontos: [pOeste.at(-2), [pOeste.at(-2)[0], 97], [100, 97]], inicio: 0.1 },
    { pontos: [[30, 97], [30, 64], [-20, 64]], inicio: 0.5 },
    { pontos: CALCADAS.find((c) => c.id === 'apoio-processo').pontos, inicio: 0.3 },
    { pontos: [[60, 97], [122, 97]], inicio: 0.7 },
    { pontos: [[-30, 64], [40, 64]], inicio: 0.2 },
  ],
  pausa: 4,
};

/* ----------------------------------------------------------------------------
 *  PORTARIA E ONIBUS (Fase 15, pedido do autor): carros de quem trabalha
 *  entram, estacionam e saem; o onibus entra, da a volta no retorno, para
 *  no abrigo — uns descem e vao ao vestiario, outros embarcam — e sai. Todo
 *  veiculo para diante da cancela (o porteiro libera) e ela sobe; desce
 *  depois que ele passa. Percursos tirados da geometria de site.js, na mao
 *  de direcao (a direita). [ADOTADO] tempos e quantidades.
 * ------------------------------------------------------------------------- */
const pv = (id) => VIAS.find((v) => v.id === id).pontos;
const ent = pv('entrada'), sai = pv('saida'), desac = pv('desaceleracao'), acel = pv('aceleracao');
const baia = pv('baia-onibus');
const zOeste = pv('publica')[0][1] - 3;          // faixa do sentido oeste, metade norte
const cE = PRACA_PORTARIA.cancelas.find((c) => c.pista === 'entrada');
const cS = PRACA_PORTARIA.cancelas.find((c) => c.pista === 'saida');
const xE = ent.at(-1)[0], xS = sai[0][0], zJ = ent.at(-1)[1];
const estac = bloco('ESTAC');
const RET = ONIBUS.retorno;
// para diante da cancela com a frente a 1,2 m do braco — o onibus, de 12 m,
// para ainda na curva de acesso: o percurso ate o braco e recortado do fim
const parar = (meio) => meio + 1.2;
function recortar(pts, d) {
  const out = [pts[0]];
  let falta = pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0) - d;
  for (let i = 1; i < pts.length && falta > 0; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const L = Math.hypot(bx - ax, bz - az);
    if (L >= falta) { out.push([ax + ((bx - ax) * falta) / L, az + ((bz - az) * falta) / L]); break; }
    out.push(pts[i]);
    falta -= L;
  }
  return out;
}
const ateBraco = [[185, zOeste], ...desac, ...ent.slice(1, -1), [xE, cE.z]];
const chegada = (meio) => recortar(ateBraco, parar(meio));
// depois da parada, o resto do caminho ate o cruzamento
const passaBraco = (meio) => [chegada(meio).at(-1), ...ateBraco.slice(chegada(meio).length - 1).filter((p) => p[1] <= chegada(meio).at(-1)[1] - 0.01 || p === ateBraco.at(-1))];
const partida = (meio) => [[xS, cS.z - parar(meio)], ...sai.slice(1), ...acel.slice(1), [-95, zOeste]];
const zSobeE = zJ + 1.75, zDesceO = zJ - 1.75;   // faixas da via do onibus
/* Entrada no retorno (Fase 19): a faixa vai para leste e o anel, onde ela o
 * encontra, aponta para o sul — a quina girava 9° em 0,4 m. Concordancia por
 * curva reversa: arco do giro do onibus tangente a faixa e, por fora, ao
 * anel. A saida e a mesma, espelhada no eixo da via. */
const GIRO_ONIBUS = VEICULOS.onibus.raioInterno + VEICULOS.onibus.largura / 2;
const conc = (() => {
  const Rf = GIRO_ONIBUS, r = RET.raio;
  const fz = zSobeE + Rf;
  const fx = RET.x - Math.sqrt((r + Rf) ** 2 - (fz - RET.z) ** 2);
  const t = [RET.x + ((fx - RET.x) * r) / (r + Rf), RET.z + ((fz - RET.z) * r) / (r + Rf)];
  const grau = (y, x) => (Math.atan2(y, x) * 180) / Math.PI;
  return { Rf, fx, fz, aF: grau(t[1] - fz, t[0] - fx), aR: grau(t[1] - RET.z, t[0] - RET.x) };
})();

export const PORTARIA_TRAFEGO = {
  cancela: { abre: 1.5, angulo: (85 * Math.PI) / 180, aproximacao: 4, liberar: 3 },
  carros: {
    // vagas da fileira norte, contadas da ponta leste (a da portaria)
    vagas: [1, 3, 6], meio: 2.3, devagar: 1.5,
    parado: [45, 70, 95], fora: [10, 35, 60],
    chegada: chegada(2.3),
    // depois da cancela: vira a esquerda no cruzamento e entra no
    // estacionamento pela faixa oeste da via dele (metade norte)
    entra: [...passaBraco(2.3), [xE, zJ + 3.5], [xE - 2.5, zJ - 1.2], [xE - 7, zJ - 1.5], [estac.x[1] - 1, zJ - 1.5]],
    // sai pela faixa leste e vira a direita na pista de saida
    // quinas vivas: o percurso as troca por arcos do raio do veiculo (Fase 19)
    sai: [[estac.x[1] - 1, zJ + 1.5], [xS, zJ + 1.5], [xS, cS.z - parar(2.3)]],
    partida: partida(2.3),
    corredor: zJ,
  },
  onibus: {
    meio: 6.1, fora: 70, parada: 30, inicio: 0.1,
    chegada: chegada(6.1),
    // vira a direita no cruzamento, segue pela faixa leste, da a volta no
    // retorno (anti-horario, como numa rotatoria) e volta para a baia
    ate: [...passaBraco(6.1), [xE, zSobeE], [conc.fx, zSobeE],
      ...arco(conc.fx, conc.fz, conc.Rf, -90, conc.aF, 3).slice(1),
      ...arco(RET.x, RET.z, RET.raio, conc.aR, -conc.aR, 5).slice(1),
      ...arco(conc.fx, 2 * zJ - conc.fz, conc.Rf, -conc.aF, 90, 3).slice(1),
      [conc.fx - 4, zDesceO], [ONIBUS.parada[0] + 4, baia[0][1]], ONIBUS.parada],
    sai: [ONIBUS.parada, [baia[0][0] + 4, baia[0][1]], [baia[0][0] - 6, zDesceO], [xS, zDesceO],
      [xS, cS.z - parar(6.1)]],
    partida: partida(6.1),
    // passageiros: descem pela porta da frente e vao pelo caminho pintado
    porta: [ONIBUS.parada[0] - 6.1 + 1.0, ONIBUS.abrigo.z[1] + 1.0],
    descem: 4, sobem: 3,
    // troca de turno (Fase 27, item 14) [ADOTADO]: quem desce troca de roupa
    // no vestiario (`troca` s) e vai a area; quem embarca veio da area e
    // trocou antes. A roupa de operador e a de data/rotinas.js.
    turno: { troca: 40 },
    caminho: ONIBUS.caminho,
    abrigo: ONIBUS.abrigo,
  },
};

export { CALCADAS };
