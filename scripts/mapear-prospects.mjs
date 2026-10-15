#!/usr/bin/env node
/**
 * mapear-prospects.mjs — Lista todos os negócios de cada nicho numa cidade, pra
 * prospecção porta a porta. Usa a Places API (New) do Google, a mesma base do
 * Google Maps, sem ninguém precisar rolar o mapa na mão.
 *
 * A cidade vira um retângulo (Nominatim/OpenStreetMap) e a busca fica PRESA nele
 * (locationRestriction): "academia" em Nerópolis não traz academia de Goiânia.
 * Um mesmo lugar achado em dois nichos aparece uma vez só, com os dois nichos.
 *
 * Uso:
 *   GOOGLE_PLACES_KEY="xxxx" node scripts/mapear-prospects.mjs --cidade "Nerópolis, GO"
 *   GOOGLE_PLACES_KEY="xxxx" node scripts/mapear-prospects.mjs --cidade "Nerópolis, GO" --nichos pilates,academia
 *   node scripts/mapear-prospects.mjs --listar-nichos
 *
 * Saída: prospeccao/<cidade>.csv (separador ; e BOM, abre direto no Excel).
 * A pasta prospeccao/ está no .gitignore — o repo é público.
 *
 * Custo: cada termo gasta 1 a 3 requisições (20 resultados por página). A lista
 * completa dá umas 60-90 por cidade, dentro da cota mensal gratuita da API.
 */

import { writeFileSync, mkdirSync } from 'node:fs';

// Nichos onde o Mensalli resolve: quem cobra mensalidade recorrente de aluno/cliente.
// `pagantes: true` = já temos cliente pagando nesse nicho (prova social na conversa).
const NICHOS = [
  { id: 'pilates',      nome: 'Studio de pilates',            pagantes: true,  termos: ['studio de pilates'] },
  { id: 'academia',     nome: 'Academia / musculação',        pagantes: true,  termos: ['academia de musculação', 'academia'] },
  { id: 'lutas',        nome: 'Artes marciais e lutas',       pagantes: true,  termos: ['jiu-jitsu', 'muay thai', 'karatê', 'judô', 'taekwondo', 'boxe', 'capoeira'] },
  { id: 'futebol',      nome: 'Escolinha de futebol',         pagantes: true,  termos: ['escolinha de futebol', 'escola de futsal'] },
  { id: 'natacao',      nome: 'Natação / hidroginástica',     pagantes: true,  termos: ['escola de natação', 'hidroginástica'] },
  { id: 'fisio',        nome: 'Fisioterapia',                 pagantes: true,  termos: ['clínica de fisioterapia'] },
  { id: 'personal',     nome: 'Personal trainer',             pagantes: true,  termos: ['personal trainer'] },
  { id: 'corrida',      nome: 'Assessoria de corrida',        pagantes: true,  termos: ['assessoria de corrida'] },
  { id: 'musica',       nome: 'Escola de música',             pagantes: true,  termos: ['escola de música', 'aula de violão'] },
  { id: 'reforco',      nome: 'Reforço escolar',              pagantes: true,  termos: ['reforço escolar', 'aulas particulares'] },
  { id: 'idiomas',      nome: 'Escola de idiomas',            pagantes: true,  termos: ['escola de inglês', 'curso de idiomas'] },
  { id: 'danca',        nome: 'Dança / ballet',               pagantes: true,  termos: ['escola de dança', 'ballet'] },
  { id: 'clube',        nome: 'Clube / projeto esportivo',    pagantes: true,  termos: ['clube esportivo', 'projeto social esportivo'] },
  // Sem pagante ainda — mesmo modelo de cobrança mensal
  { id: 'funcional',    nome: 'Funcional / crossfit',         pagantes: false, termos: ['treinamento funcional', 'crossfit'] },
  { id: 'yoga',         nome: 'Yoga',                         pagantes: false, termos: ['yoga'] },
  { id: 'raquete',      nome: 'Beach tennis / tênis / vôlei', pagantes: false, termos: ['beach tennis', 'escola de tênis', 'escolinha de vôlei', 'futevôlei'] },
  { id: 'ginastica',    nome: 'Ginástica',                    pagantes: false, termos: ['ginástica artística', 'ginástica rítmica'] },
  { id: 'creche',       nome: 'Creche / escola infantil',     pagantes: false, termos: ['creche particular', 'escola infantil particular'] },
  { id: 'cursinho',     nome: 'Cursinho / preparatório',      pagantes: false, termos: ['cursinho preparatório', 'preparatório para concurso'] },
  { id: 'cursos',       nome: 'Informática / profissionalizante', pagantes: false, termos: ['curso de informática', 'curso profissionalizante'] },
  { id: 'robotica',     nome: 'Robótica / xadrez / programação', pagantes: false, termos: ['robótica educacional', 'aula de xadrez'] },
  { id: 'artes',        nome: 'Teatro / artes / desenho',     pagantes: false, termos: ['aula de teatro', 'aula de desenho e pintura'] },
  { id: 'terapias',     nome: 'Fono / psicopedagogia',        pagantes: false, termos: ['fonoaudiologia infantil', 'psicopedagoga'] },
  { id: 'pet',          nome: 'Creche para cães / adestramento', pagantes: false, termos: ['creche para cachorro', 'adestrador de cães'] },
];

const args = process.argv.slice(2);
const arg = (nome) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? args[i + 1] : undefined;
};

if (args.includes('--listar-nichos')) {
  for (const n of NICHOS) {
    console.log(`${n.pagantes ? '★' : ' '} ${n.id.padEnd(10)} ${n.nome.padEnd(34)} ${n.termos.join(', ')}`);
  }
  console.log('\n★ = já temos cliente pagante no nicho');
  process.exit(0);
}

const KEY = process.env.GOOGLE_PLACES_KEY;
const cidade = arg('cidade');
if (!KEY || !cidade) {
  console.error('Uso: GOOGLE_PLACES_KEY="xxxx" node scripts/mapear-prospects.mjs --cidade "Nerópolis, GO" [--nichos pilates,academia]');
  process.exit(1);
}

const filtro = arg('nichos')?.split(',').map((s) => s.trim());
const nichos = filtro ? NICHOS.filter((n) => filtro.includes(n.id)) : NICHOS;
if (!nichos.length) {
  console.error('Nenhum nicho com esses ids. Veja: --listar-nichos');
  process.exit(1);
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function retanguloDaCidade(nome) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(nome)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'mensalli-prospeccao/1.0' } });
  const [lugar] = await res.json();
  if (!lugar) throw new Error(`Cidade não encontrada: ${nome}`);
  const [sul, norte, oeste, leste] = lugar.boundingbox.map(Number);
  console.log(`Cidade: ${lugar.display_name}`);
  return { low: { latitude: sul, longitude: oeste }, high: { latitude: norte, longitude: leste } };
}

const CAMPOS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.nationalPhoneNumber',
  'places.websiteUri', 'places.googleMapsUri', 'places.rating', 'places.userRatingCount',
  'places.businessStatus', 'places.primaryTypeDisplayName', 'places.location', 'nextPageToken',
].join(',');

let buscasFeitas = 0;

async function buscar(termo, retangulo) {
  const lugares = [];
  let pageToken;
  do {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': CAMPOS },
      body: JSON.stringify({
        textQuery: termo,
        languageCode: 'pt-BR',
        regionCode: 'BR',
        pageSize: 20,
        locationRestriction: { rectangle: retangulo },
        ...(pageToken && { pageToken }),
      }),
    });
    buscasFeitas++;
    const json = await res.json();
    if (!res.ok) throw new Error(`Places API ${res.status}: ${json.error?.message || JSON.stringify(json)}`);
    lugares.push(...(json.places || []));
    pageToken = json.nextPageToken;
    if (pageToken) await esperar(1500); // o token leva um instante pra valer
  } while (pageToken);
  return lugares;
}

const retangulo = await retanguloDaCidade(cidade);
const porId = new Map();

for (const nicho of nichos) {
  let achados = 0;
  for (const termo of nicho.termos) {
    const lugares = await buscar(termo, retangulo);
    for (const p of lugares) {
      if (p.businessStatus === 'CLOSED_PERMANENTLY') continue;
      const atual = porId.get(p.id);
      if (atual) {
        atual.nichos.add(nicho.nome);
        continue;
      }
      porId.set(p.id, { ...p, nichos: new Set([nicho.nome]) });
      achados++;
    }
  }
  console.log(`  ${nicho.nome.padEnd(34)} ${achados} novos`);
}

const celula = (v) => {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const whatsapp = (tel) => {
  const digitos = (tel || '').replace(/\D/g, '');
  // Só celular (11 dígitos com DDD, 9 na frente) tem chance de ser WhatsApp
  return digitos.length === 11 && digitos[2] === '9' ? `https://wa.me/55${digitos}` : '';
};

const linhas = [...porId.values()]
  .sort((a, b) => [...a.nichos][0].localeCompare([...b.nichos][0]) || (b.userRatingCount || 0) - (a.userRatingCount || 0))
  .map((p) => [
    [...p.nichos].join(' + '),
    p.displayName?.text,
    p.nationalPhoneNumber,
    whatsapp(p.nationalPhoneNumber),
    p.formattedAddress,
    p.rating,
    p.userRatingCount,
    p.primaryTypeDisplayName?.text,
    p.websiteUri,
    p.googleMapsUri,
    p.businessStatus === 'CLOSED_TEMPORARILY' ? 'fechado temporariamente' : '',
    '', // visitado?
    '', // observações
    p.id, // place id e coordenadas: usados por rotas-prospects.mjs
    p.location?.latitude,
    p.location?.longitude,
  ].map(celula).join(';'));

const cabecalho = ['Nicho', 'Nome', 'Telefone', 'WhatsApp', 'Endereço', 'Nota', 'Avaliações', 'Categoria Google', 'Site', 'Google Maps', 'Status', 'Visitado?', 'Observações', 'Place ID', 'Lat', 'Lng'];
const slug = cidade.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

mkdirSync('prospeccao', { recursive: true });
const arquivo = `prospeccao/${slug}.csv`;
writeFileSync(arquivo, '﻿' + [cabecalho.join(';'), ...linhas].join('\n'), 'utf8');
console.log(`\n${porId.size} lugares -> ${arquivo}`);
console.log(`${buscasFeitas} buscas na Places API (cobrança é por busca, não por lugar)`);
