#!/usr/bin/env node
/**
 * rotas-prospects.mjs — Transforma a lista de mapear-prospects.mjs em links do
 * Google Maps com as paradas já na ordem, pra visitar sem procurar uma por uma.
 *
 * O link de rotas do Google Maps aceita no máximo 9 paradas, então a lista é
 * ordenada por vizinho mais próximo (cada parada leva à mais perto que sobrou)
 * e cortada em blocos de 9. Sem origem no link: o Maps parte de onde você está.
 *
 * Pula:
 *   - linha com "Visitado?" preenchido (marcou no Excel, roda de novo, sai da rota)
 *   - nome que contenha alguma linha de prospeccao/excluir.txt (cliente, escola
 *     municipal, faculdade...), uma por linha, sem diferenciar maiúscula
 *   - o mesmo negócio cadastrado 2x no Google (mesmo telefone, ou nome parecido a
 *     menos de 150 m)
 *
 * Uso: node scripts/rotas-prospects.mjs prospeccao/neropolis-go.csv
 * Saída: o mesmo nome com -rotas.txt
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const PARADAS_POR_ROTA = 9;
const arquivo = process.argv[2];
if (!arquivo) {
  console.error('Uso: node scripts/rotas-prospects.mjs prospeccao/<cidade>.csv');
  process.exit(1);
}

const linhaCsv = (l) => {
  const out = [];
  let cel = '';
  let aspas = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (aspas) {
      if (c === '"' && l[i + 1] === '"') { cel += '"'; i++; }
      else if (c === '"') aspas = false;
      else cel += c;
    } else if (c === '"') aspas = true;
    else if (c === ';') { out.push(cel); cel = ''; }
    else cel += c;
  }
  out.push(cel);
  return out;
};

const [cabecalho, ...linhas] = readFileSync(arquivo, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map(linhaCsv);
const col = (nome) => {
  const i = cabecalho.indexOf(nome);
  if (i < 0) throw new Error(`CSV sem a coluna "${nome}" — gere de novo com mapear-prospects.mjs`);
  return i;
};
const C = { nome: col('Nome'), nicho: col('Nicho'), tel: col('Telefone'), visitado: col('Visitado?'), id: col('Place ID'), lat: col('Lat'), lng: col('Lng') };

const excluir = existsSync('prospeccao/excluir.txt')
  ? readFileSync('prospeccao/excluir.txt', 'utf8').split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter(Boolean)
  : [];

// Distância em metros (equiretangular — sobra precisão dentro de uma cidade)
const distancia = (a, b) => {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * 6371000;
};

// Palavras do nome que identificam o negócio (tira as genéricas do ramo).
// "Ct Henrique gonçalves Team" e "C.T. Gonçalves Team Martial Arts" dividem "goncalves".
const GENERICAS = new Set(['academia', 'studio', 'pilates', 'fitness', 'escola', 'centro', 'treinamento', 'clinica', 'fisioterapia', 'neropolis', 'unidade', 'martial']);
const palavras = (nome) => new Set(
  nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 5 && !GENERICAS.has(w)),
);

// Mesmo lugar cadastrado 2x: mesmo telefone, ou perto (150 m) com nome em comum.
// Só distância não serve — na mesma rua tem academia do lado de escola de dança.
const duplicado = (p, q) => {
  if (p.tel && p.tel === q.tel) return true;
  if (distancia(p, q) > 150) return false;
  const wq = palavras(q.nome);
  return [...palavras(p.nome)].some((w) => wq.has(w));
};

const lugares = [];
for (const l of linhas) {
  const p = { nome: l[C.nome], nicho: l[C.nicho], tel: l[C.tel], id: l[C.id], lat: Number(l[C.lat]), lng: Number(l[C.lng]) };
  if (l[C.visitado]?.trim()) continue;
  if (excluir.some((e) => p.nome.toLowerCase().includes(e))) continue;
  if (!p.id || Number.isNaN(p.lat)) continue;
  if (lugares.some((q) => duplicado(p, q))) continue;
  lugares.push(p);
}

// Começa pelo lugar mais afastado do centro, pra rota varrer a cidade de uma
// ponta à outra em vez de começar no meio e ter que voltar.
const centro = {
  lat: lugares.reduce((s, p) => s + p.lat, 0) / lugares.length,
  lng: lugares.reduce((s, p) => s + p.lng, 0) / lugares.length,
};
const restantes = [...lugares];
restantes.sort((a, b) => distancia(b, centro) - distancia(a, centro));
const ordem = [restantes.shift()];
while (restantes.length) {
  const atual = ordem[ordem.length - 1];
  let melhor = 0;
  for (let i = 1; i < restantes.length; i++) {
    if (distancia(atual, restantes[i]) < distancia(atual, restantes[melhor])) melhor = i;
  }
  ordem.push(restantes.splice(melhor, 1)[0]);
}

const link = (paradas) => {
  const destino = paradas[paradas.length - 1];
  const meio = paradas.slice(0, -1);
  const q = new URLSearchParams({
    api: '1',
    destination: `${destino.lat},${destino.lng}`,
    destination_place_id: destino.id,
    travelmode: 'driving',
  });
  if (meio.length) {
    q.set('waypoints', meio.map((p) => `${p.lat},${p.lng}`).join('|'));
    q.set('waypoint_place_ids', meio.map((p) => p.id).join('|'));
  }
  return `https://www.google.com/maps/dir/?${q}`;
};

const saida = [];
for (let i = 0; i < ordem.length; i += PARADAS_POR_ROTA) {
  const paradas = ordem.slice(i, i + PARADAS_POR_ROTA);
  saida.push(`ROTA ${i / PARADAS_POR_ROTA + 1} (${paradas.length} paradas)`);
  paradas.forEach((p, j) => saida.push(`  ${j + 1}. ${p.nome}${p.tel ? ` — ${p.tel}` : ''}`));
  saida.push(`  ${link(paradas)}`, '');
}

const destinoTxt = arquivo.replace(/\.csv$/, '-rotas.txt');
writeFileSync(destinoTxt, saida.join('\n'), 'utf8');
console.log(saida.join('\n'));
console.log(`${ordem.length} paradas em ${Math.ceil(ordem.length / PARADAS_POR_ROTA)} rotas -> ${destinoTxt}`);
