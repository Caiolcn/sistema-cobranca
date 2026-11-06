/* --------------------------------------------------------------------------
   Perfil do negócio — opções do pop-up do primeiro acesso e do /admin.

   Os `value` precisam bater com os CHECKs de sql-perfil-negocio-primeiro-acesso.sql
   (usuarios.area_atuacao e usuarios.como_conheceu). Mudou aqui, muda lá.
-------------------------------------------------------------------------- */

export const AREAS_ATUACAO = [
  { value: 'luta', label: 'CT de luta / artes marciais', icon: 'mdi:karate' },
  { value: 'futebol', label: 'Escolinha de futebol / futsal', icon: 'mdi:soccer' },
  { value: 'academia', label: 'Academia / funcional / crossfit', icon: 'mdi:dumbbell' },
  { value: 'personal', label: 'Personal trainer', icon: 'mdi:account-heart-outline' },
  { value: 'pilates', label: 'Pilates', icon: 'mdi:yoga' },
  { value: 'danca', label: 'Dança / ballet', icon: 'mdi:human-female-dance' },
  { value: 'natacao', label: 'Natação', icon: 'mdi:swim' },
  { value: 'outros_esportes', label: 'Outros esportes (vôlei, tênis, beach…)', icon: 'mdi:tennis' },
  { value: 'educacao', label: 'Reforço escolar / idiomas / cursos', icon: 'mdi:school-outline' },
  { value: 'musica', label: 'Música', icon: 'mdi:music-note' },
  { value: 'saude', label: 'Fisioterapia / saúde', icon: 'mdi:stethoscope' },
  { value: 'outro', label: 'Outro', icon: 'mdi:dots-horizontal' }
]

export const COMO_CONHECEU = [
  { value: 'anuncio_meta', label: 'Anúncio no Instagram/Facebook', icon: 'mdi:bullhorn-outline' },
  { value: 'instagram', label: 'Instagram (perfil ou post do Mensalli)', icon: 'mdi:instagram' },
  { value: 'google', label: 'Google', icon: 'mdi:google' },
  { value: 'ia', label: 'ChatGPT ou outra IA', icon: 'mdi:robot-outline' },
  { value: 'indicacao', label: 'Indicação de amigo ou cliente', icon: 'mdi:account-group-outline' },
  { value: 'youtube_tiktok', label: 'YouTube / TikTok', icon: 'mdi:play-box-outline' },
  { value: 'outro', label: 'Outro', icon: 'mdi:dots-horizontal' },
  { value: 'prefiro_nao_informar', label: 'Prefiro não informar', icon: 'mdi:eye-off-outline' }
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
