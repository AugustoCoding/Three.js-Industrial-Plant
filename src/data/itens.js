/**
 * A roda de itens (pedido do autor, 24/11/2026: "uma roda de itens ao
 * apertar LB igual em GTA, com itens engracados como lanterna, bazuca,
 * sanduiche"). So no modo andar: LB (ou Tab) segurado abre a roda, o
 * analogico direito (ou o mouse travado) escolhe, soltar equipa. O LT (botao direito, com o mouse travado) ergue e mira;
 * o RT (botao esquerdo) usa o item.
 * Geometria em lib/itens.js; o que cada um faz, em site/roda.js.
 * Tudo [ADOTADO]: e brincadeira, nao dado de processo.
 */
export const ITENS = [
  { id: 'mao', nome: 'Mão', icone: '☝️', dica: 'LT aponta' },
  { id: 'lanterna', nome: 'Lanterna', icone: '🔦', dica: 'RT liga e desliga' },
  { id: 'sanduiche', nome: 'Sanduíche', icone: '🥪', dica: 'RT dá uma mordida' },
  { id: 'bazuca', nome: 'Bazuca', icone: '🚀', dica: 'RT dispara (só fumaça, ninguém se machuca)' },
  { id: 'cafe', nome: 'Café', icone: '☕', dica: 'RT toma um gole' },
  { id: 'buzina', nome: 'Buzina', icone: '📯', dica: 'RT buzina' },
];

export const RODA = {
  raio: 130,                  // px, do centro aos itens
  zonaMorta: 0.5,             // analogico: inclinacao minima para escolher
  mouseMinimo: 25,            // px de mouse travado para escolher
  baixo: 0.7,                 // fracao do braco erguido so segurando um item
  erguido: 0.85,              // usando sem mirar (RT sem LT)
  lanterna: { intensidade: 60, alcance: 45, abertura: 22, penumbra: 0.5 },   // cd, m, graus
  foguete: { vel: 38, vida: 1.6, raioExplosao: 3.5, duracaoExplosao: 0.9, coice: 0.06 },
  mordidas: 4,
};
