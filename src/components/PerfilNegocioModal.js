import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useUser } from '../contexts/UserContext'
import { modoEspelhoAtivo } from '../utils/modoEspelho'
import { showToast } from '../Toast'
import Modal from '../design-system/components/Modal'
import Input from '../design-system/components/Input'
import Select from '../design-system/components/Select'
import Button from '../design-system/components/Button'
import { AREAS_ATUACAO, COMO_CONHECEU, nomeEhPadrao } from '../data/perfilNegocio'

/* --------------------------------------------------------------------------
   Pop-up "Conte sobre seu negócio" — primeiro acesso.

   Pergunta três coisas, todas opcionais: nome do negócio, área e como conheceu.
   Existe por dois motivos:
     1. Toda conta nasce "Minha Empresa" e esse nome entra nas cobranças
        ({{nomeEmpresa}}). O passo de renomear saiu do onboarding guiado e
        ~3 em cada 4 contas novas seguiam com o nome padrão.
     2. Área e origem não existiam como dado — só dava pra chutar o nicho
        pelo nome da empresa, e ~58% das contas chegam sem UTM.

   Quem vê (uma vez só, nunca respondeu nem pulou):
     - conta criada há menos de 7 dias; ou
     - conta antiga ainda com "Minha Empresa" / nome vazio.
   Admin, "ver como" e modo espelho nunca veem: escreveriam na conta do cliente.

   Fechar (X, Esc, clique fora, "Agora não") grava perfil_dispensado_em e não
   volta. Se o SQL ainda não rodou, a leitura das colunas falha e o pop-up
   simplesmente não aparece — não trava nada.

   `onResolvido` avisa a Home quando o pop-up saiu do caminho (não vai abrir ou
   foi fechado), pra o anúncio de novidades não abrir empilhado em cima dele.
-------------------------------------------------------------------------- */

const SETE_DIAS = 7 * 24 * 60 * 60 * 1000
// Trava da aba: se a gravação de "pulou" falhar (rede), não reabre a cada
// volta pra Home na mesma sessão.
const CHAVE_SESSAO = 'mensalli_perfil_negocio_mostrado'

export default function PerfilNegocioModal({ onResolvido }) {
  const { realUserId, isAdmin, adminViewingAs, loading, refreshUserData } = useUser()

  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [area, setArea] = useState('')
  const [areaOutro, setAreaOutro] = useState('')
  const [comoConheceu, setComoConheceu] = useState('')
  const [salvando, setSalvando] = useState(false)

  const resolvidoRef = useRef(false)
  const resolver = () => {
    if (resolvidoRef.current) return
    resolvidoRef.current = true
    onResolvido?.()
  }

  // Prévia do admin (/app/home?previa-perfil): abre o pop-up na conta admin
  // só para ver o visual. Salvar e pular não gravam nada.
  const previa = isAdmin && !adminViewingAs && new URLSearchParams(window.location.search).has('previa-perfil')

  useEffect(() => {
    if (loading) return
    if (previa) { setAberto(true); return }
    if (!realUserId || isAdmin || adminViewingAs || modoEspelhoAtivo()) {
      resolver()
      return
    }
    try {
      if (sessionStorage.getItem(CHAVE_SESSAO) === realUserId) {
        resolver()
        return
      }
    } catch { /* sessionStorage indisponível: segue */ }

    let cancelado = false
    supabase
      .from('usuarios')
      .select('created_at, nome_empresa, perfil_respondido_em, perfil_dispensado_em')
      .eq('id', realUserId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelado) return
        // Coluna inexistente (SQL não rodou) ou falha de rede: não mostra.
        if (error || !data) { resolver(); return }
        if (data.perfil_respondido_em || data.perfil_dispensado_em) { resolver(); return }

        const contaNova = data.created_at && (Date.now() - new Date(data.created_at).getTime()) < SETE_DIAS
        if (!contaNova && !nomeEhPadrao(data.nome_empresa)) { resolver(); return }

        setAberto(true)
      })

    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, realUserId, isAdmin, adminViewingAs])

  const fechar = () => {
    // A trava da aba entra só ao fechar: se a Home remontar com o pop-up
    // aberto (troca de modo foco), ele volta em vez de sumir sem resposta.
    try { sessionStorage.setItem(CHAVE_SESSAO, realUserId) } catch { /* ok */ }
    setAberto(false)
    resolver()
  }

  const pular = async () => {
    if (salvando) return
    fechar()
    if (previa) return
    const { error } = await supabase
      .from('usuarios')
      .update({ perfil_dispensado_em: new Date().toISOString() })
      .eq('id', realUserId)
    if (error) console.warn('Não foi possível registrar que pulou o perfil:', error)
  }

  const salvar = async () => {
    if (salvando) return
    if (previa) {
      showToast('Prévia: nada foi salvo.', 'info')
      fechar()
      return
    }
    setSalvando(true)
    try {
      const patch = {
        perfil_respondido_em: new Date().toISOString(),
        area_atuacao: area || null,
        area_atuacao_outro: area === 'outro' ? (areaOutro.trim().slice(0, 60) || null) : null,
        como_conheceu: comoConheceu || null
      }
      // Em branco não apaga o nome atual (pedido do dono).
      const nomeLimpo = nome.trim().slice(0, 80)
      if (nomeLimpo) patch.nome_empresa = nomeLimpo

      const { error } = await supabase.from('usuarios').update(patch).eq('id', realUserId)
      if (error) throw error

      // Sem isso o contexto segue com o nome antigo até um F5.
      if (nomeLimpo && refreshUserData) await refreshUserData()
      showToast('Pronto, anotado!', 'success')
      fechar()
    } catch (e) {
      console.error('Erro ao salvar perfil do negócio:', e)
      showToast('Não deu pra salvar agora. Você pode ajustar o nome depois em Configuração.', 'error')
      fechar()
    } finally {
      setSalvando(false)
    }
  }

  if (!aberto) return null

  return (
    <Modal
      isOpen={aberto}
      onClose={pular}
      size="sm"
      title="Conta pra gente sobre seu negócio"
      subtitle="Leva 20 segundos e é tudo opcional."
      closeOnBackdrop={!salvando}
      closeOnEsc={!salvando}
    >
      <Modal.Body>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input
            label="Nome do negócio"
            placeholder="Ex.: CT Leões do Jiu-Jitsu"
            helper="É o nome que seus alunos vão ver nas cobranças."
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={80}
          />
          <Select
            label="Sua área de atuação"
            placeholder="Escolha a que mais combina"
            options={AREAS_ATUACAO}
            value={area}
            onChange={setArea}
            searchable
            searchPlaceholder="Buscar área..."
            portal
          />
          {area === 'outro' && (
            <Input
              label="Qual?"
              placeholder="Ex.: escola de surf"
              value={areaOutro}
              onChange={(e) => setAreaOutro(e.target.value)}
              maxLength={60}
            />
          )}
          <Select
            label="Como conheceu o Mensalli?"
            placeholder="Escolha uma opção"
            options={COMO_CONHECEU}
            value={comoConheceu}
            onChange={setComoConheceu}
            portal
          />
        </div>
      </Modal.Body>
      <Modal.Footer align="between">
        <Button variant="ghost" onClick={pular} disabled={salvando}>Agora não</Button>
        <Button variant="primary" onClick={salvar} loading={salvando}>Começar agora</Button>
      </Modal.Footer>
    </Modal>
  )
}
