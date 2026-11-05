/* --------------------------------------------------------------------------
   Perfil do negócio — opções do pop-up do primeiro acesso e do /admin.

   Os `value` precisam bater com os CHECKs de sql-perfil-negocio-primeiro-acesso.sql
   (usuarios.area_atuacao e usuarios.como_conheceu). Mudou aqui, muda lá.
-------------------------------------------------------------------------- */

export const AREAS_ATUACAO = [
  { value: 'luta', label: 'CT de luta / artes marciais' },
  { value: 'futebol', label: 'Escolinha de futebol / futsal' },
  { value: 'academia', label: 'Academia / funcional / crossfit' },
  { value: 'personal', label: 'Personal trainer' },
  { value: 'pilates', label: 'Pilates' },
  { value: 'danca', label: 'Dança / ballet' },
  { value: 'natacao', label: 'Natação' },
  { value: 'outros_esportes', label: 'Outros esportes (vôlei, tênis, beach…)' },
  { value: 'educacao', label: 'Reforço escolar / idiomas / cursos' },
  { value: 'musica', label: 'Música' },
  { value: 'saude', label: 'Fisioterapia / saúde' },
  { value: 'outro', label: 'Outro' }
]

export const COMO_CONHECEU = [
  { value: 'anuncio_meta', label: 'Anúncio no Instagram/Facebook' },
  { value: 'instagram', label: 'Instagram (perfil ou post do Mensalli)' },
  { value: 'google', label: 'Google' },
  { value: 'ia', label: 'ChatGPT ou outra IA' },
  { value: 'indicacao', label: 'Indicação de amigo ou cliente' },
  { value: 'youtube_tiktok', label: 'YouTube / TikTok' },
  { value: 'outro', label: 'Outro' },
  { value: 'prefiro_nao_informar', label: 'Prefiro não informar' }
]

const rotulo = (lista) => (valor) => lista.find((o) => o.value === valor)?.label || ''

export const rotuloArea = rotulo(AREAS_ATUACAO)
export const rotuloComoConheceu = rotulo(COMO_CONHECEU)

// Nome que a conta ganha no cadastro (trigger handle_new_user + Signup.js).
export const NOME_EMPRESA_PADRAO = 'Minha Empresa'

export const nomeEhPadrao = (nome) => {
  const n = String(nome || '').trim()
  return !n || n.toLowerCase() === NOME_EMPRESA_PADRAO.toLowerCase()
}
