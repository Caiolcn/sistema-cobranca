/* ============================================================
   Gera as ilustrações das Atualizações do produto (aba /admin > Atualizações).

     node scripts/gerar-artes-atualizacoes.mjs

   Saída: public/atualizacoes/<slug>.svg  →  imagem_url = '/atualizacoes/<slug>.svg'

   POR QUE ILUSTRAÇÃO E NÃO SCREENSHOT
   Print de verdade é melhor, mas envelhece: os PNGs em public/ são do Financeiro
   anterior à migração pro Design System e já mostram uma tela que não existe
   mais. A ilustração é abstrata o suficiente pra sobreviver a um refactor de
   layout, e honesta: ninguém confunde com uma captura de tela.

   REGRA DE CONTEÚDO
   Texto real só no que importa ("Em Atraso", "PIX", "Frequência") — o resto é
   barra cinza. Escrever nomes e valores falsos deixaria com cara de screenshot
   e passaria a mentir sobre o produto.

   Cada arte tem UM destaque (anel + etiqueta) no elemento que a atualização
   mudou. Sem isso a arte vira decoração e não ensina onde olhar.
   ============================================================ */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const DESTINO = resolve(AQUI, '../public/atualizacoes')

const W = 640, H = 400

// Paleta = design-system/tokens.css. Manter em sincronia; se a marca mudar de
// verde, é aqui que a arte inteira acompanha.
const C = {
  fundo: '#F1F5F9',
  superficie: '#FFFFFF',
  borda: '#E2E8F0',
  bordaForte: '#CBD5E1',
  barra: '#E2E8F0',
  barraClara: '#EFF3F8',
  texto: '#334155',
  textoFraco: '#94A3B8',
  verde: '#4CAF50',
  verdeEscuro: '#388E3C',
  dark: '#344848',
  roxo: '#8867A1',
  roxoClaro: '#F3EEFA',
  vermelho: '#EF4444',
  ambar: '#F59E0B',
  azul: '#3B82F6',
}

const FONTE = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"

/* ---------- primitivas ---------- */

const rect = (x, y, w, h, fill, r = 0, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`

const barra = (x, y, w, h = 8, fill = C.barra) => rect(x, y, w, h, fill, h / 2)

const texto = (x, y, t, { tam = 12, cor = C.texto, peso = 500, anchor = 'start' } = {}) =>
  `<text x="${x}" y="${y}" font-family="${FONTE}" font-size="${tam}" font-weight="${peso}" fill="${cor}" text-anchor="${anchor}">${esc(t)}</text>`

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const card = (x, y, w, h, r = 12) =>
  rect(x, y, w, h, C.superficie, r, `stroke="${C.borda}" stroke-width="1"`)

const pill = (x, y, t, cor, corTexto = '#fff', { tam = 10 } = {}) => {
  const w = String(t).length * (tam * 0.62) + 16
  return rect(x, y, w, tam + 10, cor, (tam + 10) / 2) +
    texto(x + w / 2, y + tam + 2, t, { tam, cor: corTexto, peso: 700, anchor: 'middle' })
}

// Anel de destaque + etiqueta. É a única coisa colorida forte da arte, então
// ele é lido primeiro — que é exatamente a intenção.
// `pos`: 'auto' tenta acima e cai pra baixo; 'acima'/'abaixo' forçam; 'y:N' fixa.
// Precisou virar parâmetro porque o automático acertava o eixo mas não o vizinho:
// acima do bloco de formas de pagamento fica o preço, acima de uma linha da
// tabela fica o cabeçalho. Quem monta a arte sabe onde tem espaço vazio.
const destaque = (x, y, w, h, rotulo, cor = C.roxo, r = 8, pos = 'auto') => {
  let s = rect(x - 4, y - 4, w + 8, h + 8, 'none', r + 3,
    `stroke="${cor}" stroke-width="2.5" stroke-dasharray="0"`)
  if (rotulo) {
    const lw = rotulo.length * 6.4 + 20
    const lx = Math.max(8, Math.min(x + w / 2 - lw / 2, W - lw - 8))
    const acima = y - 38
    let ly
    if (typeof pos === 'number') ly = pos
    else if (pos === 'acima') ly = acima
    else if (pos === 'abaixo') ly = y + h + 12
    else ly = acima >= 6 ? acima : y + h + 12
    ly = Math.max(6, Math.min(ly, H - 30))
    // Halo branco: a etiqueta às vezes encosta em conteúdo vizinho e sem a
    // separação ela some dentro dele.
    s += rect(lx - 3, ly - 3, lw + 6, 30, '#fff', 15)
    s += rect(lx, ly, lw, 24, cor, 12) +
      texto(lx + lw / 2, ly + 16, rotulo, { tam: 11, cor: '#fff', peso: 700, anchor: 'middle' })
  }
  return s
}

const svg = (corpo) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">` +
  rect(0, 0, W, H, C.fundo) + corpo + '</svg>'

/* ---------- arquétipos de tela ---------- */

// Lista com cabeçalho e linhas — Financeiro, Alunos, qualquer tabela do DS.
function listagem({ titulo, colunas = [], linhas = 5, destacar = null, rotulo, kpis = null }) {
  let s = ''
  // Com KPI a faixa começa mais embaixo: a etiqueta do destaque precisa de uma
  // faixa livre acima dele, senão cai em cima do cabeçalho da tabela.
  let topo = kpis ? 56 : 30

  if (kpis) {
    const lg = (W - 60 - 24) / 3
    kpis.forEach((k, i) => {
      const x = 30 + i * (lg + 12)
      s += card(x, topo, lg, 56, 10)
      s += rect(x, topo, 3, 56, k.cor, 1.5)
      s += texto(x + 14, topo + 22, k.rotulo, { tam: 10, cor: C.textoFraco, peso: 600 })
      s += texto(x + 14, topo + 42, k.valor, { tam: 15, cor: k.cor, peso: 700 })
      if (destacar === `kpi${i}`) s += destaque(x, topo, lg, 56, rotulo, C.roxo, 10, 'acima')
    })
    topo += 76
  }

  const alt = H - topo - 30
  s += card(30, topo, W - 60, alt)
  if (titulo) s += texto(48, topo + 26, titulo, { tam: 13, peso: 700 })

  const cabY = topo + (titulo ? 44 : 26)
  s += rect(31, cabY, W - 62, 28, C.barraClara)
  colunas.forEach((col) => s += texto(col.x, cabY + 19, col.t, { tam: 10, cor: C.textoFraco, peso: 700 }))

  const linhaAlt = 34
  for (let i = 0; i < linhas; i++) {
    const y = cabY + 28 + i * linhaAlt
    if (y + linhaAlt > topo + alt) break
    s += rect(31, y + linhaAlt - 1, W - 62, 1, C.borda)
    colunas.forEach((col, j) => {
      const larg = col.larg || (j === 0 ? 90 : 54)
      s += barra(col.x, y + linhaAlt / 2 - 4, larg - (i % 3) * 8, 8)
    })
    if (destacar === `linha${i}`) s += destaque(40, y + 5, W - 80, linhaAlt - 10, rotulo, C.roxo, 8, topo + 4)
  }
  return s
}

// Painel de configuração: linhas com interruptor.
function interruptores({ titulo, itens, destacar = 0, rotulo }) {
  let s = card(30, 30, W - 60, H - 60)
  s += texto(50, 58, titulo, { tam: 14, peso: 700 })
  s += rect(31, 74, W - 62, 1, C.borda)

  itens.forEach((it, i) => {
    const y = 96 + i * 62
    s += texto(50, y + 16, it.nome, { tam: 13, peso: 600 })
    s += barra(50, y + 28, 180, 7, C.barra)
    const sx = W - 50 - 44
    s += rect(sx, y + 2, 44, 24, it.ligado ? C.verde : C.bordaForte, 12)
    s += `<circle cx="${it.ligado ? sx + 32 : sx + 12}" cy="${y + 14}" r="9" fill="#fff"/>`
    if (i === destacar) s += destaque(sx - 2, y, 48, 28, rotulo, C.verdeEscuro, 14, 'acima')
    if (i < itens.length - 1) s += rect(50, y + 46, W - 100, 1, C.borda)
  })
  return s
}

// Grade da agenda (dias × horários).
function agenda({ destacar = { col: 1, lin: 1 }, rotulo, celulas = {} }) {
  let s = card(30, 30, W - 60, H - 60)
  const dias = ['SEG', 'TER', 'QUA', 'QUI', 'SEX']
  const cw = (W - 100) / 5, ch = 62
  dias.forEach((d, i) => s += texto(50 + i * cw + cw / 2, 66, d, { tam: 10, cor: C.textoFraco, peso: 700, anchor: 'middle' }))
  s += rect(50, 76, W - 100, 1, C.borda)

  for (let l = 0; l < 4; l++) {
    for (let c = 0; c < 5; c++) {
      const x = 50 + c * cw + 4, y = 88 + l * ch
      const chave = `${c},${l}`
      const cheio = celulas[chave] ?? ((c + l) % 3 !== 0)
      if (!cheio) continue
      s += rect(x, y, cw - 8, ch - 10, C.barraClara, 8)
      s += barra(x + 10, y + 12, cw - 40, 7, C.bordaForte)
      s += texto(x + 10, y + 38, celulas[`t${chave}`] || '', { tam: 10, cor: C.roxo, peso: 700 })
      if (destacar.col === c && destacar.lin === l) {
        s += rect(x, y, cw - 8, ch - 10, C.roxoClaro, 8)
        s += barra(x + 10, y + 12, cw - 40, 7, C.roxo)
        s += texto(x + 10, y + 38, celulas[`t${chave}`] || '', { tam: 10, cor: C.roxo, peso: 700 })
        s += destaque(x, y, cw - 8, ch - 10, rotulo)
      }
    }
  }
  return s
}

// Campo de busca com resultados.
function busca({ consulta, resultados, rotulo }) {
  let s = card(30, 58, W - 60, 46, 10)
  s += `<circle cx="58" cy="81" r="8" fill="none" stroke="${C.textoFraco}" stroke-width="2"/>`
  s += `<line x1="64" y1="87" x2="70" y2="93" stroke="${C.textoFraco}" stroke-width="2" stroke-linecap="round"/>`
  s += texto(84, 86, consulta, { tam: 14, cor: C.texto, peso: 500 })
  s += destaque(30, 58, W - 60, 46, rotulo, C.roxo, 10, 'acima')

  s += card(30, 124, W - 60, H - 154)
  resultados.forEach((r, i) => {
    const y = 142 + i * 54
    s += `<circle cx="58" cy="${y + 18}" r="16" fill="${C.roxoClaro}"/>`
    s += texto(58, y + 23, r.inicial, { tam: 13, cor: C.roxo, peso: 700, anchor: 'middle' })
    s += texto(86, y + 15, r.nome, { tam: 13, peso: 600 })
    s += texto(86, y + 32, r.sub, { tam: 11, cor: C.textoFraco, peso: 500 })
    if (i < resultados.length - 1) s += rect(50, y + 44, W - 100, 1, C.borda)
  })
  return s
}

// Conversa de WhatsApp.
function conversa({ linhas, rotulo, destacarIdx = 0 }) {
  let s = rect(30, 30, W - 60, H - 60, '#ECE5DD', 14)
  s += rect(30, 30, W - 60, 42, '#075E54', 14)
  s += rect(30, 58, W - 60, 14, '#075E54')
  s += `<circle cx="58" cy="51" r="12" fill="#ffffff33"/>`
  s += texto(80, 56, 'Aluno', { tam: 12, cor: '#fff', peso: 700 })

  let y = 94
  linhas.forEach((l, i) => {
    const larg = Math.min(W - 130, l.t.length * 6.6 + 28)
    const x = 52
    const alt = 40
    s += rect(x, y, larg, alt, '#fff', 10)
    s += texto(x + 14, y + 25, l.t, { tam: 12, cor: C.texto, peso: 500 })
    if (i === destacarIdx) s += destaque(x, y, larg, alt, rotulo, C.verdeEscuro, 10)
    y += alt + 14
  })
  s += rect(52, H - 96, W - 104, 40, '#fff', 20)
  s += barra(72, H - 80, 150, 8, C.bordaForte)
  s += `<circle cx="${W - 84}" cy="${H - 76}" r="15" fill="${C.verde}"/>`
  s += `<path d="M ${W - 90} ${H - 82} L ${W - 76} ${H - 76} L ${W - 90} ${H - 70} Z" fill="#fff"/>`
  return s
}

// Janela de navegador (site público / portal).
function navegador({ titulo, corpo = 'landing', rotulo, destacar = 'hero' }) {
  let s = card(30, 30, W - 60, H - 60)
  s += rect(31, 31, W - 62, 34, C.barraClara)
  ;['#EF4444', '#F59E0B', '#22C55E'].forEach((c, i) =>
    s += `<circle cx="${50 + i * 16}" cy="48" r="5" fill="${c}"/>`)
  s += rect(108, 39, W - 160, 20, '#fff', 10, `stroke="${C.borda}"`)
  s += texto(120, 53, titulo, { tam: 10, cor: C.textoFraco, peso: 600 })
  s += rect(31, 65, W - 62, 1, C.borda)

  if (corpo === 'landing') {
    s += rect(31, 66, W - 62, 128, C.dark)
    s += barra(60, 100, 240, 12, '#ffffff55')
    s += barra(60, 122, 180, 9, '#ffffff33')
    s += rect(60, 146, 110, 30, C.verde, 8)
    s += texto(115, 166, 'Quero treinar', { tam: 11, cor: '#fff', peso: 700, anchor: 'middle' })
    if (destacar === 'hero') s += destaque(31, 66, W - 62, 128, rotulo, C.verdeEscuro, 4)
    for (let i = 0; i < 3; i++) {
      const x = 50 + i * ((W - 100) / 3)
      s += rect(x, 214, (W - 100) / 3 - 14, 108, C.barraClara, 10)
      s += barra(x + 14, 236, 70, 9, C.bordaForte)
      s += barra(x + 14, 256, 100, 7)
      s += barra(x + 14, 272, 80, 7)
    }
  } else if (corpo === 'video') {
    s += rect(60, 90, W - 120, 168, C.dark, 10)
    s += `<circle cx="${W / 2}" cy="174" r="30" fill="#ffffff26"/>`
    s += `<path d="M ${W / 2 - 10} 160 L ${W / 2 + 16} 174 L ${W / 2 - 10} 188 Z" fill="#fff"/>`
    s += destaque(60, 90, W - 120, 168, rotulo, C.verdeEscuro, 10)
    s += barra(60, 278, 200, 10, C.bordaForte)
    s += barra(60, 298, 300, 8)
  } else if (corpo === 'pagamento') {
    s += texto(W / 2, 106, 'Mensalidade de março', { tam: 13, peso: 700, anchor: 'middle' })
    s += texto(W / 2, 138, 'R$ 150,00', { tam: 26, cor: C.dark, peso: 700, anchor: 'middle' })
    const opcoes = [['PIX', C.verde], ['Cartão', C.bordaForte], ['Boleto', C.bordaForte]]
    opcoes.forEach(([t, cor], i) => {
      const x = 90 + i * 160
      s += rect(x, 176, 140, 46, i === 0 ? '#F0FDF4' : '#fff', 10, `stroke="${cor}" stroke-width="${i === 0 ? 2 : 1}"`)
      s += texto(x + 70, 205, t, { tam: 13, cor: i === 0 ? C.verdeEscuro : C.textoFraco, peso: 700, anchor: 'middle' })
    })
    s += destaque(90, 176, 460, 46, rotulo, C.verdeEscuro, 10, 'abaixo')
    s += rect(90, 268, 460, 40, C.dark, 8)
    s += texto(320, 293, 'Pagar agora', { tam: 13, cor: '#fff', peso: 700, anchor: 'middle' })
  }
  return s
}

// Quadro estilo kanban (CRM).
function quadro({ colunas, destacarCol = 0, rotulo }) {
  let s = ''
  const cw = (W - 60 - 24) / 3
  colunas.forEach((col, i) => {
    const x = 30 + i * (cw + 12)
    s += rect(x, 50, cw, H - 80, C.barraClara, 12)
    s += texto(x + 14, 74, col.t, { tam: 11, cor: C.textoFraco, peso: 700 })
    s += pill(x + cw - 40, 60, String(col.n), C.bordaForte, C.texto, { tam: 9 })
    for (let k = 0; k < col.n && k < 4; k++) {
      const y = 90 + k * 66
      s += card(x + 10, y, cw - 20, 56, 10)
      s += `<circle cx="${x + 32}" cy="${y + 26}" r="12" fill="${col.cor}22"/>`
      s += barra(x + 50, y + 16, cw - 90, 8, C.bordaForte)
      s += barra(x + 50, y + 32, cw - 110, 7)
      s += rect(x + 10, y, 3, 56, col.cor, 1.5)
    }
    if (i === destacarCol) s += destaque(x, 50, cw, H - 80, rotulo, C.roxo, 12, 'acima')
  })
  return s
}

// Gráfico de barras (relatórios).
function grafico({ titulo, rotulo, valores = [40, 70, 55, 90, 65, 80, 45] }) {
  let s = card(30, 30, W - 60, H - 60)
  s += texto(50, 58, titulo, { tam: 14, peso: 700 })
  s += rect(31, 74, W - 62, 1, C.borda)
  const base = 320, maxAlt = 190
  const bw = (W - 120) / valores.length
  valores.forEach((v, i) => {
    const alt = (v / 100) * maxAlt
    const x = 60 + i * bw
    const destaqueBarra = v === Math.max(...valores)
    s += rect(x, base - alt, bw - 14, alt, destaqueBarra ? C.roxo : C.barra, 6)
    s += texto(x + (bw - 14) / 2, base + 20, ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'][i] || '', { tam: 10, cor: C.textoFraco, peso: 600, anchor: 'middle' })
    if (destaqueBarra) s += destaque(x, base - alt, bw - 14, alt, rotulo, C.roxo, 6)
  })
  s += rect(50, base + 2, W - 100, 1, C.bordaForte)
  return s
}

// Ficha com abas (aluno).
function fichaAbas({ abas, destacarAba = 1, rotulo, corpo = 'lista' }) {
  let s = card(30, 30, W - 60, H - 60)
  s += `<circle cx="66" cy="66" r="20" fill="${C.roxoClaro}"/>`
  s += texto(66, 72, 'A', { tam: 16, cor: C.roxo, peso: 700, anchor: 'middle' })
  s += barra(98, 56, 130, 11, C.bordaForte)
  s += barra(98, 74, 90, 8)

  let ax = 50
  abas.forEach((a, i) => {
    const aw = a.length * 6.6 + 24
    const ativo = i === destacarAba
    s += rect(ax, 104, aw, 30, ativo ? C.roxoClaro : 'transparent', 8)
    s += texto(ax + aw / 2, 124, a, { tam: 11, cor: ativo ? C.roxo : C.textoFraco, peso: ativo ? 700 : 600, anchor: 'middle' })
    if (ativo) s += destaque(ax, 104, aw, 30, rotulo, C.roxo, 8)
    ax += aw + 6
  })
  s += rect(50, 142, W - 100, 1, C.borda)

  if (corpo === 'lista') {
    for (let i = 0; i < 3; i++) {
      const y = 164 + i * 56
      s += rect(50, y, W - 100, 46, C.barraClara, 10)
      s += barra(66, y + 14, 120 - i * 20, 9, C.bordaForte)
      s += barra(66, y + 30, 80, 7)
      s += texto(W - 66, y + 28, ['R$ 120,00', 'R$ 90,00', 'R$ 250,00'][i], { tam: 12, cor: C.dark, peso: 700, anchor: 'end' })
    }
  }
  return s
}

// Moldura de celular — PWA e página de links, que só existem no telefone.
function celular({ conteudo, rotulo }) {
  const pw = 200, px = (W - pw) / 2, py = 24, ph = H - 48
  let s = rect(px - 6, py - 6, pw + 12, ph + 12, C.dark, 26)
  s += rect(px, py, pw, ph, '#fff', 20)
  s += rect(px + 70, py + 8, 60, 10, C.dark, 5)

  if (conteudo === 'instalar') {
    s += rect(px + 14, py + 34, pw - 28, 44, C.barraClara, 10)
    s += barra(px + 26, py + 50, 100, 8, C.bordaForte)
    for (let i = 0; i < 3; i++) s += rect(px + 14, py + 88 + i * 54, pw - 28, 44, C.barraClara, 10)
    const cy = py + ph - 108
    s += rect(px + 10, cy, pw - 20, 92, '#fff', 14, `stroke="${C.verde}" stroke-width="2"`)
    s += rect(px + 24, cy + 14, 32, 32, C.verde, 8)
    s += texto(px + 66, cy + 28, 'Mensalli', { tam: 11, peso: 700 })
    s += texto(px + 66, cy + 42, 'na sua tela inicial', { tam: 9, cor: C.textoFraco, peso: 500 })
    s += rect(px + 24, cy + 56, pw - 48, 26, C.verde, 8)
    s += texto(px + pw / 2, cy + 74, 'Instalar', { tam: 11, cor: '#fff', peso: 700, anchor: 'middle' })
    s += destaque(px + 10, cy, pw - 20, 92, rotulo, C.verdeEscuro, 14, 'acima')
  } else if (conteudo === 'links') {
    s += `<circle cx="${px + pw / 2}" cy="${py + 66}" r="26" fill="${C.dark}"/>`
    s += texto(px + pw / 2, py + 72, 'A', { tam: 18, cor: '#fff', peso: 700, anchor: 'middle' })
    s += texto(px + pw / 2, py + 112, 'Sua Academia', { tam: 12, peso: 700, anchor: 'middle' })
    const rotulos = ['Falar no WhatsApp', 'Agendar aula', 'Portal do aluno', 'Instagram']
    rotulos.forEach((t, i) => {
      const y = py + 132 + i * 46
      s += rect(px + 16, y, pw - 32, 36, i === 0 ? C.verde : '#fff', 10,
        i === 0 ? '' : `stroke="${C.bordaForte}"`)
      s += texto(px + pw / 2, y + 23, t, { tam: 10, cor: i === 0 ? '#fff' : C.texto, peso: 600, anchor: 'middle' })
    })
    s += destaque(px + 16, py + 132, pw - 32, 36 + 3 * 46, rotulo, C.verdeEscuro, 10, 'acima')
  }
  return s
}

// Cartão de status da conexão do WhatsApp.
function conexao({ estado, titulo, linhas, rotulo }) {
  const cor = estado === 'ok' ? C.verde : C.ambar
  let s = card(30, 60, W - 60, H - 120, 14)
  s += `<circle cx="90" cy="118" r="26" fill="${cor}22"/>`
  s += `<circle cx="90" cy="118" r="9" fill="${cor}"/>`
  s += texto(134, 112, titulo, { tam: 15, peso: 700 })
  s += texto(134, 132, 'WhatsApp da sua empresa', { tam: 11, cor: C.textoFraco, peso: 500 })
  s += rect(50, 160, W - 100, 1, C.borda)
  linhas.forEach((l, i) => {
    const y = 184 + i * 46
    s += `<circle cx="66" cy="${y + 10}" r="9" fill="${l.feito ? C.verde : C.barra}"/>`
    if (l.feito) s += `<path d="M 62 ${y + 10} L 65 ${y + 14} L 71 ${y + 6}" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>`
    s += texto(88, y + 15, l.t, { tam: 12, cor: l.feito ? C.texto : C.textoFraco, peso: 600 })
    if (i === 0) s += destaque(56, y, W - 112, 24, rotulo, C.verdeEscuro, 8, 'acima')
  })
  return s
}

// Modal com prévia editável da mensagem (cobrança rápida).
function modalPrevia({ rotulo }) {
  let s = card(70, 40, W - 140, H - 80, 14)
  s += texto(100, 78, 'Cobrar agora', { tam: 15, peso: 700 })
  s += rect(71, 96, W - 142, 1, C.borda)
  s += texto(100, 124, 'MENSAGEM QUE VAI SAIR', { tam: 9, cor: C.textoFraco, peso: 700 })
  s += rect(100, 136, W - 200, 118, '#fff', 10, `stroke="${C.roxo}" stroke-width="2"`)
  s += texto(118, 162, 'Oi Marina, tudo bem?', { tam: 12, peso: 500 })
  s += texto(118, 186, 'A mensalidade de R$ 150,00', { tam: 12, peso: 500 })
  s += texto(118, 210, 'vence hoje.', { tam: 12, peso: 500 })
  s += rect(118, 224, 2, 16, C.roxo)
  s += destaque(100, 136, W - 200, 118, rotulo, C.roxo, 10, 'acima')
  s += rect(W - 240, H - 96, 150, 40, C.verde, 8)
  s += texto(W - 165, H - 70, 'Enviar', { tam: 13, cor: '#fff', peso: 700, anchor: 'middle' })
  return s
}

// Formulário (ficha preenchida pelo aluno / baixa manual com acréscimo).
function formulario({ titulo, campos, cta, rotulo, destacarCampo = 0, resumo = null }) {
  let s = card(70, 34, W - 140, H - 68, 14)
  s += texto(W / 2, 74, titulo, { tam: 15, peso: 700, anchor: 'middle' })
  if (resumo) {
    s += rect(100, 92, W - 200, 78, C.barraClara, 10)
    resumo.forEach((r, i) => {
      const y = 118 + i * 22
      s += texto(118, y, r.t, { tam: 11, cor: C.textoFraco, peso: 600 })
      s += texto(W - 118, y, r.v, { tam: 12, cor: r.forte ? C.dark : C.texto, peso: r.forte ? 700 : 600, anchor: 'end' })
    })
    if (destacarCampo === 'resumo') s += destaque(100, 92, W - 200, 78, rotulo, C.verdeEscuro, 10, 'abaixo')
  }
  // 84px por campo (e não 62): a etiqueta do destaque tem 24px e precisa caber
  // ACIMA do campo destacado sem cair no rótulo do campo anterior. Com o passo
  // curto ela pousava em cima do campo de cima.
  const base = resumo ? 224 : 110
  campos.forEach((c, i) => {
    const y = base + i * 84
    s += texto(100, y, c, { tam: 10, cor: C.textoFraco, peso: 600 })
    const destacado = destacarCampo === i
    s += rect(100, y + 10, W - 200, 38, '#fff', 8,
      `stroke="${destacado ? C.roxo : C.borda}" stroke-width="${destacado ? 2 : 1}"`)
    s += barra(116, y + 25, 120, 8, C.bordaForte)
    if (destacado) s += destaque(100, y + 10, W - 200, 38, rotulo, C.roxo, 8, 'acima')
  })
  s += rect(100, H - 92, W - 200, 40, C.verde, 8)
  s += texto(W / 2, H - 66, cta, { tam: 13, cor: '#fff', peso: 700, anchor: 'middle' })
  return s
}

/* ---------- as artes ---------- */

const ARTES = {
  /* --- as 9 que já estão no ar --- */

  'cobranca-rapida': () => modalPrevia({ rotulo: 'dá pra editar antes' }),

  'whatsapp-reconecta': () => conexao({
    estado: 'ok', titulo: 'Conectado',
    linhas: [
      { t: 'Reiniciou a sessão sozinho', feito: true },
      { t: 'Confirmou que voltou', feito: true },
      { t: 'Você nem precisou saber', feito: true },
    ],
    rotulo: 'sem você fazer nada',
  }),

  'instalar-app': () => celular({ conteudo: 'instalar', rotulo: 'vira ícone no celular' }),

  'pagar-antes': () => navegador({
    titulo: 'portal do aluno', corpo: 'pagamento', rotulo: 'antes de vencer',
  }),

  'pular-mes': () => {
    let s = listagem({
      titulo: 'Mensalidades',
      colunas: [{ x: 48, t: 'ALUNO', larg: 100 }, { x: 250, t: 'VENCIMENTO' }, { x: 400, t: 'VALOR' }, { x: 520, t: 'STATUS' }],
      linhas: 4,
    })
    s += card(360, 130, 200, 160, 12)
    const opcoes = ['Confirmar pagamento', 'Pular mês', 'Editar', 'Excluir']
    opcoes.forEach((t, i) => {
      const y = 152 + i * 34
      const ativo = i === 1
      if (ativo) s += rect(370, y - 4, 180, 30, C.roxoClaro, 8)
      s += texto(386, y + 16, t, { tam: 12, cor: ativo ? C.roxo : C.texto, peso: ativo ? 700 : 500 })
    })
    s += destaque(370, 182, 180, 30, 'e já gera o próximo', C.roxo, 8, 'abaixo')
    return s
  },

  'baixa-multa': () => formulario({
    titulo: 'Confirmar pagamento',
    resumo: [
      { t: 'Mensalidade', v: 'R$ 150,00' },
      { t: 'Multa e juros', v: '+ R$ 8,40' },
      { t: 'Total recebido', v: 'R$ 158,40', forte: true },
    ],
    // Um campo só: com o resumo de três linhas ocupando o topo, o segundo campo
    // era empurrado pra debaixo do botão.
    campos: ['DATA DO PAGAMENTO'],
    cta: 'Dar baixa', destacarCampo: 'resumo', rotulo: 'já com o acréscimo',
  }),

  'aviso-queda': () => conexao({
    estado: 'alerta', titulo: 'Conexão caiu',
    linhas: [
      { t: 'Avisamos você no WhatsApp', feito: true },
      { t: 'Checagem a cada 30 minutos', feito: true },
      { t: 'Confirmado em duas rodadas', feito: true },
    ],
    rotulo: 'você fica sabendo na hora',
  }),

  'pagina-links': () => celular({ conteudo: 'links', rotulo: 'na bio do Instagram' }),

  'ficha-portal': () => formulario({
    titulo: 'Complete seus dados',
    campos: ['DATA DE NASCIMENTO', 'ENDEREÇO'],
    cta: 'Enviar', destacarCampo: 1, rotulo: 'o aluno preenche',
  }),

  /* --- as 28 agendadas --- */

  'venda-avulsa': () => fichaAbas({
    abas: ['Dados', 'Vendas', 'Mensalidades', 'Presenças'],
    destacarAba: 1, rotulo: 'entra no faturamento',
  }),

  'formas-pagamento': () => navegador({
    titulo: 'portal do aluno', corpo: 'pagamento', rotulo: 'você escolhe quais',
  }),

  'frequencia': () => grafico({ titulo: 'Frequência por aluno', rotulo: 'quem mais aparece' }),

  'silenciar-aluno': () => interruptores({
    titulo: 'Comunicações do aluno',
    itens: [
      { nome: 'Comunicações ativas', ligado: false },
      { nome: 'Cobrança automática', ligado: true },
      { nome: 'Lembrete de aula', ligado: true },
      { nome: 'Mensagem de aniversário', ligado: true },
    ],
    destacar: 0, rotulo: 'silencia tudo',
  }),

  'busca-alunos': () => busca({
    consulta: 'jose',
    resultados: [
      { inicial: 'J', nome: 'José Carlos', sub: 'achou sem acento' },
      { inicial: 'M', nome: 'Marina (resp. José)', sub: 'achou pelo responsável' },
      { inicial: 'J', nome: 'Joselaine', sub: '(11) 99999-9999' },
    ],
    rotulo: 'acento, telefone, responsável',
  }),

  'varias-turmas': () => agenda({
    destacar: { col: 3, lin: 1 }, rotulo: 'o mesmo aluno',
    celulas: { 't1,1': '8/12', 't3,1': '8/12' },
  }),

  'multa-juros': () => interruptores({
    titulo: 'Multa e juros por atraso',
    itens: [
      { nome: 'Cobrar multa e juros', ligado: true },
      { nome: 'Aplicar no portal do aluno', ligado: true },
      { nome: 'Aplicar na baixa manual', ligado: true },
    ],
    destacar: 0, rotulo: 'calcula sozinho',
  }),

  'construtor-site': () => navegador({
    titulo: 'suaacademia.com.br', corpo: 'landing', rotulo: 'suas cores e seu logo',
  }),

  'agendamento-online': () => agenda({
    destacar: { col: 2, lin: 0 }, rotulo: 'o aluno escolhe',
    celulas: { 't0,0': '6/10', 't2,0': '3/10', 't4,0': '9/10' },
  }),

  'cobranca-duplicada': () => conversa({
    linhas: [{ t: 'Sua mensalidade venceu hoje' }],
    rotulo: 'uma vez só', destacarIdx: 0,
  }),

  'crm-alunos': () => quadro({
    colunas: [
      { t: 'EM DIA', n: 3, cor: C.verde },
      { t: 'SUMIU', n: 2, cor: C.ambar },
      { t: 'EM ATRASO', n: 2, cor: C.vermelho },
    ],
    destacarCol: 1, rotulo: 'antes de cancelar',
  }),

  'em-aberto': () => listagem({
    kpis: [
      { rotulo: 'EM ABERTO', valor: 'R$ 1.546', cor: C.ambar },
      { rotulo: 'RECEBIDO', valor: 'R$ 3.200', cor: C.verde },
      { rotulo: 'EM ATRASO', valor: 'R$ 420', cor: C.vermelho },
    ],
    colunas: [{ x: 48, t: 'ALUNO', larg: 100 }, { x: 250, t: 'VENCIMENTO' }, { x: 400, t: 'VALOR' }, { x: 520, t: 'STATUS' }],
    linhas: 3, destacar: 'kpi0', rotulo: 'o que falta receber',
  }),

  'filtros-indicadores': () => listagem({
    kpis: [
      { rotulo: 'PERÍODO FILTRADO', valor: 'R$ 980', cor: C.roxo },
      { rotulo: 'RECEBIDO', valor: 'R$ 700', cor: C.verde },
      { rotulo: 'EM ABERTO', valor: 'R$ 280', cor: C.ambar },
    ],
    colunas: [{ x: 48, t: 'ALUNO', larg: 100 }, { x: 250, t: 'PAGO EM' }, { x: 400, t: 'VALOR' }, { x: 520, t: 'FORMA' }],
    linhas: 3, destacar: 'kpi0', rotulo: 'segue o filtro',
  }),

  'colaboradores': () => listagem({
    titulo: 'Colaboradores',
    colunas: [{ x: 48, t: 'NOME', larg: 110 }, { x: 250, t: 'FUNÇÃO' }, { x: 400, t: 'CONTATO' }, { x: 520, t: 'ATIVO' }],
    linhas: 4, destacar: 'linha0', rotulo: 'sua equipe',
  }),

  'campo-data': () => {
    let s = card(30, 60, W - 60, 120, 12)
    s += texto(60, 96, 'Data de nascimento', { tam: 11, cor: C.textoFraco, peso: 600 })
    s += rect(60, 108, W - 120, 46, '#fff', 10, `stroke="${C.roxo}" stroke-width="2"`)
    s += texto(80, 138, '15/03/1998', { tam: 16, cor: C.texto, peso: 600 })
    s += rect(W - 108, 120, 2, 22, C.roxo)
    s += destaque(60, 108, W - 120, 46, 'digite ou clique', C.roxo, 10)
    s += card(30, 204, W - 60, 150, 12)
    for (let l = 0; l < 3; l++) for (let c = 0; c < 7; c++) {
      const x = 60 + c * 74, y = 232 + l * 40
      s += rect(x, y, 30, 30, (l === 1 && c === 3) ? C.roxo : C.barraClara, 8)
    }
    return s
  },

  'data-deslocada': () => listagem({
    titulo: 'Filtro por data de pagamento',
    colunas: [{ x: 48, t: 'ALUNO', larg: 110 }, { x: 250, t: 'PAGO EM' }, { x: 400, t: 'VALOR' }, { x: 520, t: 'FORMA' }],
    linhas: 4, destacar: 'linha0', rotulo: 'o dia certo',
  }),

  'video-site': () => navegador({ titulo: 'seu site', corpo: 'video', rotulo: 'seção de vídeo' }),

  'menu-config': () => {
    let s = card(30, 30, 220, H - 60)
    const grupos = [
      { t: 'NEGÓCIO', itens: ['Dados da Empresa', 'Planos', 'Colaboradores'] },
      { t: 'PAGAMENTOS', itens: ['Integrações'] },
      { t: 'MODELOS', itens: ['Anamnese', 'Contratos'] },
    ]
    let y = 62
    grupos.forEach((g) => {
      s += texto(50, y, g.t, { tam: 9, cor: C.textoFraco, peso: 700 })
      y += 16
      g.itens.forEach((it) => {
        s += texto(50, y + 12, it, { tam: 11, cor: C.texto, peso: 500 })
        y += 28
      })
      y += 12
    })
    s += destaque(44, 48, 192, 100, 'agrupado por assunto', C.roxo, 8)
    s += card(266, 30, W - 296, H - 60)
    s += barra(290, 66, 160, 12, C.bordaForte)
    s += barra(290, 92, 240, 8)
    s += barra(290, 112, 200, 8)
    for (let i = 0; i < 3; i++) s += rect(290, 146 + i * 62, W - 344, 48, C.barraClara, 10)
    return s
  },

  'clique-duplo': () => {
    let s = card(140, 90, 360, 220, 14)
    s += texto(320, 140, 'Confirmar pagamento?', { tam: 15, peso: 700, anchor: 'middle' })
    s += barra(190, 164, 260, 8)
    s += barra(220, 184, 200, 8)
    s += rect(190, 226, 120, 44, '#fff', 10, `stroke="${C.borda}"`)
    s += texto(250, 254, 'Cancelar', { tam: 12, cor: C.textoFraco, peso: 600, anchor: 'middle' })
    s += rect(330, 226, 120, 44, C.dark, 10)
    s += texto(390, 254, 'Confirmar', { tam: 12, cor: '#fff', peso: 700, anchor: 'middle' })
    s += destaque(330, 226, 120, 44, 'trava no 1º clique', C.verdeEscuro, 10)
    return s
  },

  'vagas-turma': () => agenda({
    destacar: { col: 2, lin: 1 }, rotulo: '8 de 12',
    celulas: { 't0,0': '6/10', 't2,1': '8/12', 't4,2': '9/10', 't1,1': '4/12' },
  }),

  'mudar-horario': () => {
    let s = agenda({ destacar: { col: -1, lin: -1 }, rotulo: '', celulas: { 't1,1': '8/12' } })
    s += card(300, 120, 200, 150, 12)
    ;['Ver ficha', 'Mudar horário', 'Pausar', 'Remover'].forEach((t, i) => {
      const y = 140 + i * 34
      const ativo = i === 1
      if (ativo) s += rect(310, y - 4, 180, 30, C.roxoClaro, 8)
      s += texto(326, y + 16, t, { tam: 12, cor: ativo ? C.roxo : C.texto, peso: ativo ? 700 : 500 })
    })
    s += destaque(310, 136, 180, 30, 'sem recadastrar', C.roxo, 8)
    return s
  },

  'link-agendamento': () => {
    let s = navegador({ titulo: 'agendar aula', corpo: 'nenhum', rotulo: '' })
    s += texto(320, 118, 'Quem vai agendar?', { tam: 17, peso: 700, anchor: 'middle' })
    s += rect(120, 146, 400, 46, '#fff', 10, `stroke="${C.borda}"`)
    s += texto(140, 175, 'Seu nome', { tam: 13, cor: C.textoFraco, peso: 500 })
    s += rect(120, 204, 400, 46, '#fff', 10, `stroke="${C.borda}"`)
    s += texto(140, 233, 'WhatsApp', { tam: 13, cor: C.textoFraco, peso: 500 })
    s += rect(120, 268, 400, 44, C.verde, 10)
    s += texto(320, 296, 'Continuar', { tam: 13, cor: '#fff', peso: 700, anchor: 'middle' })
    s += destaque(120, 100, 400, 150, 'voltou', C.verdeEscuro, 10)
    return s
  },

  'nome-aluno-real': () => conversa({
    linhas: [
      { t: 'Oi Marina! A mensalidade do Pedro' },
      { t: 'vence amanhã.' },
    ],
    rotulo: 'mãe + nome do filho', destacarIdx: 0,
  }),

  'portal-atraso': () => navegador({
    titulo: 'portal do aluno', corpo: 'pagamento', rotulo: 'já com multa e juros',
  }),

  'nome-responsavel': () => conversa({
    linhas: [{ t: 'Oi Marina, tudo bem?' }],
    rotulo: 'nome de quem recebe', destacarIdx: 0,
  }),

  'assinatura-cartao': () => interruptores({
    titulo: 'Forma de pagamento da assinatura',
    itens: [
      { nome: 'Cartão de crédito (renova sozinho)', ligado: true },
      { nome: 'PIX todo mês', ligado: false },
    ],
    destacar: 0, rotulo: 'não esquece mais',
  }),

  'filtro-mes': () => {
    let s = card(30, 50, W - 60, 90, 12)
    s += texto(56, 82, 'Período', { tam: 11, cor: C.textoFraco, peso: 600 })
    const meses = ['mai', 'jun', 'jul', 'ago']
    meses.forEach((m, i) => {
      const x = 56 + i * 96
      const ativo = i === 2
      s += rect(x, 94, 84, 32, ativo ? C.roxo : '#fff', 8, ativo ? '' : `stroke="${C.borda}"`)
      s += texto(x + 42, 115, m, { tam: 12, cor: ativo ? '#fff' : C.textoFraco, peso: 700, anchor: 'middle' })
      if (ativo) s += destaque(x, 94, 84, 32, 'um clique', C.roxo, 8)
    })
    // Gráfico desenhado aqui e não via grafico(): aquele arquétipo traz o próprio
    // card, e sobrepor dois cards deixava a arte com duas molduras.
    s += card(30, 160, W - 60, H - 190)
    const vals = [50, 80, 60, 95, 70]
    const base = 330, bw = (W - 120) / vals.length
    vals.forEach((v, i) => {
      const alt = (v / 100) * 130
      const x = 60 + i * bw
      s += rect(x, base - alt, bw - 16, alt, i === 3 ? C.roxo : C.barra, 6)
    })
    s += rect(50, base + 2, W - 100, 1, C.bordaForte)
    return s
  },

  'aluno-excluido': () => agenda({
    destacar: { col: 2, lin: 2 }, rotulo: 'saiu da grade',
    celulas: { 't2,2': '7/12', 't0,1': '9/12' },
  }),
}

/* ---------- execução ---------- */

mkdirSync(DESTINO, { recursive: true })
let n = 0
for (const [slug, fn] of Object.entries(ARTES)) {
  writeFileSync(resolve(DESTINO, `${slug}.svg`), svg(fn()), 'utf8')
  n++
}
console.log(`${n} artes geradas em public/atualizacoes/`)
