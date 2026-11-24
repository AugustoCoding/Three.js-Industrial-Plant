/**
 * ===========================================================================
 *  INTERFACE
 * ===========================================================================
 *  Tudo em DOM puro sobre o canvas. Nenhuma dependencia de framework — o
 *  entregavel final precisa ser um arquivo unico que abre em qualquer
 *  navegador, inclusive no celular do professor.
 */

function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

export function criarUI(container, opts) {
  const hud = el('div', 'hud');
  container.appendChild(hud);

  /* ------------------------------ cabecalho ------------------------------ */
  // (sem titulo escrito na tela: pedido do autor, 16/11/2026)

  /* --------------------------- barra de vistas ---------------------------
   * Com painel de ficha, painel de exibicao, etiquetas e cotas ligados ao
   * mesmo tempo, sobra pouco 3D visivel. Esta barra liga e desliga cada peca
   * da interface — inclusive ela propria, pela tecla H. */
  const barra = el('div', 'barra-hud');
  hud.appendChild(barra);

  const pecas = {};                 // id -> { el, ligado }
  function registrar(id, elemento, rotuloBtn, atalho) {
    pecas[id] = { el: elemento, ligado: true };
    const b = el('button', 'btn-hud');
    b.innerHTML = `${rotuloBtn}<kbd>${atalho}</kbd>`;
    b.title = `Mostrar/ocultar — tecla ${atalho}`;
    b.onclick = () => alternarPeca(id);
    b.dataset.peca = id;
    barra.appendChild(b);
    return b;
  }

  function alternarPeca(id, forcar) {
    const p = pecas[id];
    if (!p) return;
    p.ligado = forcar ?? !p.ligado;
    p.el.classList.toggle('oculto', !p.ligado);
    barra.querySelector(`[data-peca="${id}"]`)?.classList.toggle('desligado', !p.ligado);
  }

  /* Os paineis Ficha e Exibicao sairam da maquete: nao servem a apresentacao. */

  /* --------------------------- tela de ajuda ------------------------------
   * Para quem abre a maquete pela primeira vez (o professor): os controles de
   * mouse, teclado e controle de Xbox, as vistas e o que cada painel faz. As
   * vistas saem da mesma lista que alimenta os botoes — uma fonte so. */
  const dica = el('div', 'dica');
  const linhas = (pares) => pares.map(([k, v]) => `<div class="aj-l"><kbd>${k}</kbd><span>${v}</span></div>`).join('');
  dica.innerHTML = `
    <div class="aj-cab"><b>Como usar a maquete</b><span>Feche com <kbd>?</kbd> ou <kbd>Esc</kbd></span></div>
    <div class="aj-grade">
      <section><h4>Mouse e teclado</h4>${linhas([
        ['Arrastar', 'olhar em volta'], ['W A S D', 'andar'], ['Shift', 'correr'],
        ['Espaço / Ctrl', 'subir / descer'], ['Scroll', 'avançar e recuar'],
        ['Botão direito', 'deslocar a vista'], ['Espaço duas vezes', 'andar no chão / voar'],
      ])}</section>
      <section><h4>Vistas prontas</h4>${linhas((opts.vistas ?? []).map((v) => [v.tecla, v.nome]))}</section>
      <section><h4>Painéis</h4>${linhas([
        ['P', 'planta do terreno'], ['H', 'esconder tudo'], ['?', 'esta ajuda'],
        ['G', 'passeio automático (Esc para)'], ['Espaço / ← →', 'no passeio: pausa / parada anterior e seguinte'],
        ['N', 'dia e noite'], ['C', 'cores da tubulação'], ['M', 'companion (segue você no modo andar)'],
        ...(opts.botoes ?? []).filter((b) => b.id.startsWith('achar-')).map((b) => [b.atalho, `localizar: ${b.rotulo.toLowerCase()}`]),
      ])}</section>
      <section><h4>Controle de Xbox</h4>${linhas([
        ['Analógico esq.', 'andar (clique: correr)'], ['Analógico dir.', 'olhar'],
        ['A duas vezes', 'troca entre voar e andar no chão'], ['A', 'voando: sobe · andando: pula'],
        ['B / clique dir.', 'voando: desce'], ['RT / LT', 'voando: subir / descer · andando: LT ergue o braço, RT usa o item'],
        ['Y', 'esconde o HUD'], ['X', 'chama o companion'], ['LB / RB', 'vista anterior / próxima · andando, LB segurado: roda de itens'],
        ['Direcional', 'ir para o item seguinte da lista'], ['Start', 'esta ajuda'], ['View', 'passeio automático (A pausa, LB/RB pulam)'],
      ])}</section>
    </div>
    <div class="aj-pe">Os <b>prédios são entráveis</b>: a porta abre quando você chega perto e as
      paredes não deixam passar; no ADM, suba pelo vão da escada (voando: Espaço ou RT).</div>`;
  hud.appendChild(dica);

  // aviso curto no pe da tela (modo de andar/voar, veiculo localizado)
  const aviso = el('div', 'aviso');
  hud.appendChild(aviso);
  let fimAviso = 0;
  function avisar(texto, segundos = 2.5) {
    aviso.textContent = texto;
    aviso.classList.add('ligado');
    clearTimeout(fimAviso);
    fimAviso = setTimeout(() => aviso.classList.remove('ligado'), segundos * 1000);
  }

  /* ------------------- registro das pecas e atalhos ---------------------- */
  // etiquetas: sem botao nem atalho; so a vista de planta as acende (sao a
  // legenda dela), por isso ficam fora do "esconder tudo"
  pecas.rotulos3d = { el: document.querySelector('.camada-rotulos') ?? el('div'), ligado: true, fixa: true };
  registrar('dica', dica, 'Ajuda', '?');

  // Ficha, exibicao, etiquetas e ajuda nascem ocultas: cobriam o modelo, que e
  // o que se abre a maquete para ver (a TAG pintada no costado identifica o
  // vaso de perto). Os botoes da barra e os atalhos trazem de volta.
  for (const id of ['rotulos3d', 'dica']) alternarPeca(id, false);

  /* Acoes da barra: diferentes das pecas acima, nao escondem nada — trocam de
   * modo (a vista de planta). O botao fica aceso enquanto o modo estiver ligado. */
  const acoesBarra = {};
  const botoes = {};
  for (const a of opts.botoes ?? []) {
    const b = el('button', 'btn-hud');
    b.innerHTML = `${a.rotulo}<kbd>${a.atalho}</kbd>`;
    b.title = a.titulo ?? '';
    b.onclick = () => a.aoClicar();
    barra.appendChild(b);
    acoesBarra[a.codigo] = a;
    botoes[a.id] = b;
  }

  window.addEventListener('keydown', (ev) => {
    if (ev.target instanceof HTMLInputElement || ev.ctrlKey || ev.altKey || ev.metaKey) return;
    const acao = acoesBarra[ev.code];
    if (acao) { ev.preventDefault(); acao.aoClicar(); return; }
    if (ev.code === 'Escape' && pecas.dica?.ligado) { alternarPeca('dica', false); return; }
    const vista = opts.vistas?.find((v) => ev.code === `Digit${v.tecla}` || ev.code === `Numpad${v.tecla}`);
    if (vista) { ev.preventDefault(); opts.aoVista?.(vista.id); return; }
    const mapa = { Slash: 'dica', IntlRo: 'dica', KeyH: '__tudo' };
    const id = mapa[ev.code];
    if (!id) return;
    ev.preventDefault();
    if (id === '__tudo') {
      alternarTudo();
    } else {
      alternarPeca(id);
    }
  });

  /** Esconde tudo (H, Y no controle) ou traz de volta. */
  function alternarTudo() {
    const moveis = Object.keys(pecas).filter((k) => !pecas[k].fixa);
    const algumLigado = moveis.some((k) => pecas[k].ligado);
    for (const k of moveis) alternarPeca(k, !algumLigado);
    barra.classList.toggle('sozinha', algumLigado);
  }

  /** Marca a caixa sem disparar o aoAlternar (quem chama ja aplicou). */
  const ligada = (id) => !!pecas[id]?.ligado;

  return { alternarPeca, alternarTudo, ligada, avisar, botoes };
}
