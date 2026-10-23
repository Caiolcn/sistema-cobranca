// Filtro do cadastro contra conta de curioso: telefone que não existe e e-mail
// descartável. Em 22/10/2026 entrou uma conta com telefone 23123213123 (DDD 23
// não existe) e e-mail de temp-mail; a boas-vindas falhou em silêncio na
// Evolution com "exists: false".
//
// É só o filtro do navegador — quem chamar o signUp direto passa por cima. O
// objetivo é barrar o curioso e avisar quem errou o número sem querer, não
// ser trava de segurança.

// DDDs válidos no Brasil (Anatel).
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99
])

// Retorna a mensagem de erro, ou null se o número passa.
// Aceita celular (DDD + 9 + 8 dígitos) e fixo (DDD + 2..5 + 7 dígitos), porque
// tem estúdio que roda WhatsApp Business em linha fixa.
export function validarTelefoneBR(telefone) {
  const n = (telefone || '').replace(/\D/g, '')
  if (n.length !== 10 && n.length !== 11) return 'WhatsApp inválido. Use DDD + número.'

  if (!DDDS.has(Number(n.slice(0, 2)))) return 'DDD inválido. Confira o número do seu WhatsApp.'

  const numero = n.slice(2)
  if (n.length === 11 && numero[0] !== '9') return 'Celular deve começar com 9 depois do DDD.'
  if (n.length === 10 && !/^[2-5]/.test(numero)) return 'WhatsApp inválido. Confira o número com DDD.'

  // 11 1111-1111, 99 99999-9999 e afins.
  if (/^(\d)\1+$/.test(numero)) return 'WhatsApp inválido. Confira o número com DDD.'

  return null
}

// Provedores de e-mail temporário mais comuns. Lista, não serviço externo: se
// aparecer um domínio novo no painel, é só acrescentar aqui.
const DOMINIOS_DESCARTAVEIS = new Set([
  'tuamaeaquelaursa.com',
  'temp-mail.org', 'temp-mail.io', 'tempmail.com', 'tempmail.net', 'tempmail.dev',
  'tempmail.plus', 'tempmailo.com', 'tempr.email', 'tmpmail.org', 'tmpmail.net',
  'tmpeml.com', 'tempmailaddress.com', 'temporary-mail.net', 'tempinbox.com',
  '10minutemail.com', '10minutemail.net', '10minemail.com', '20minutemail.it',
  'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamail.biz',
  'guerrillamailblock.com', 'sharklasers.com', 'grr.la', 'pokemail.net', 'spam4.me',
  'mailinator.com', 'mailinator.net', 'mailinator2.com',
  'yopmail.com', 'yopmail.net', 'yopmail.fr', 'cool.fr.nf', 'jetable.fr.nf',
  'nospam.ze.tc', 'nomail.xl.cx', 'mega.zik.dyndns.org', 'courriel.fr.nf',
  'moncourrier.fr.nf', 'speed.1s.fr',
  'throwawaymail.com', 'trashmail.com', 'trashmail.net', 'trashmail.de',
  'getnada.com', 'nada.email', 'dispostable.com', 'maildrop.cc', 'mailnesia.com',
  'mailcatch.com', 'mintemail.com', 'mohmal.com', 'emailondeck.com',
  'fakeinbox.com', 'fakemail.net', 'emailfake.com', 'email-fake.com',
  'mail.tm', 'mail.gw', 'emltmp.com', 'dropmail.me', 'minuteinbox.com',
  'inboxkitten.com', 'burnermail.io', 'spamgourmet.com', 'mytemp.email',
  'tempail.com', 'luxusmail.org', 'harakirimail.com', 'mailpoof.com',
  'emailnator.com', 'smailpro.com', 'disposablemail.com', 'byom.de',
  'linshiyouxiang.net', 'mvrht.net', 'crazymailing.com'
])

export function emailDescartavel(email) {
  const dominio = String(email || '').trim().toLowerCase().split('@')[1] || ''
  return DOMINIOS_DESCARTAVEIS.has(dominio)
}
