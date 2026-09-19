// Página pública de autocadastro: /cadastro/:slug
// O professor manda o link, o aluno preenche a ficha e entra como pendente.
// O professor aprova na tela de Alunos, escolhendo plano e vencimento.
// Feita com os componentes do Design System (Card, Input, Button,
// EmptyState) e as cores da marca — não usa a cor da landing da escola.
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { FUNCTIONS_URL, SUPABASE_ANON_KEY as ANON_KEY } from '../supabaseClient'
import Card from '../design-system/components/Card'
import Input from '../design-system/components/Input'
import Button from '../design-system/components/Button'
import EmptyState from '../design-system/components/EmptyState'
import {
  mascaraTelefone, mascaraCPF, mascaraData, validarTelefone, validarCPF, dataNascimentoParaISO, idadeEmAnos
} from '../utils/validators'

const headers = { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }

const FORM_VAZIO = {
  nome: '', dataNascimento: '', telefone: '',
  responsavelNome: '', responsavelTelefone: '',
  email: '', cpf: '',
  website: '' // isca anti-robô, fica escondida
}

// Fora do componente de propósito: declarado dentro, vira um tipo novo a
// cada render e o React remonta os inputs — o campo perde o foco a cada letra.
function Pagina({ children }) {
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--color-bg-page)', fontFamily: 'var(--font-sans)',
      display: 'flex', justifyContent: 'center', padding: 'var(--space-6) var(--space-4)', boxSizing: 'border-box'
    }}>
      <div style={{ width: '100%', maxWidth: 440, margin: 'auto 0' }}>{children}</div>
    </div>
  )
}

export default function Autocadastro() {
  const { slug } = useParams()
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [empresa, setEmpresa] = useState(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [erros, setErros] = useState({}) // { campo: mensagem }
  const [erroEnvio, setErroEnvio] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  // Menor de idade sai da data de nascimento: com a data completa e menos de
  // 18 anos, os campos do responsável aparecem e passam a ser obrigatórios.
  const nascimentoISO = dataNascimentoParaISO(form.dataNascimento)
  const menor = !!nascimentoISO && idadeEmAnos(nascimentoISO) < 18

  useEffect(() => {
    const carregar = async () => {
      try {
        const res = await fetch(`${FUNCTIONS_URL}/autocadastro-dados?slug=${encodeURIComponent(slug)}`, { headers })
        const json = await res.json()
        if (!res.ok) setErro(json.error === 'Link de cadastro desativado'
          ? 'Este link de cadastro está desativado. Fale com a escola.'
          : 'Não encontramos este link. Confira com a escola.')
        else setEmpresa(json.empresa)
      } catch {
        setErro('Não foi possível carregar. Verifique sua internet e tente de novo.')
      } finally {
        setLoading(false)
      }
    }
    carregar()
  }, [slug])

  // Atualiza o campo e apaga o erro dele assim que o aluno corrige
  const mudar = (campo, valor) => {
    setForm(f => ({ ...f, [campo]: valor }))
    if (erros[campo]) setErros(e => ({ ...e, [campo]: undefined }))
  }
  const campo = (nome, mascara) => ({
    value: form[nome],
    error: erros[nome],
    onChange: e => mudar(nome, mascara ? mascara(e.target.value) : e.target.value)
  })

  const validar = () => {
    const e = {}
    if (form.nome.trim().length < 2) e.nome = 'Digite o nome completo do aluno'
    if (!dataNascimentoParaISO(form.dataNascimento)) e.dataNascimento = 'Data inválida. Use DD/MM/AAAA'
    if (menor) {
      if (form.responsavelNome.trim().length < 2) e.responsavelNome = 'Digite o nome do responsável'
      if (!validarTelefone(form.responsavelTelefone)) e.responsavelTelefone = 'WhatsApp inválido'
    } else if (!validarTelefone(form.telefone)) {
      e.telefone = 'WhatsApp inválido. Use (XX) XXXXX-XXXX'
    }
    if (form.cpf.trim() && !validarCPF(form.cpf)) e.cpf = 'CPF inválido'
    setErros(e)
    return Object.keys(e).length === 0
  }

  const enviar = async () => {
    setErroEnvio('')
    if (!validar()) return

    setEnviando(true)
    try {
      const res = await fetch(`${FUNCTIONS_URL}/autocadastro-enviar`, {
        method: 'POST', headers,
        body: JSON.stringify({
          slug,
          website: form.website,
          nome: form.nome.trim(),
          data_nascimento: dataNascimentoParaISO(form.dataNascimento),
          menor,
          telefone: form.telefone,
          responsavel_nome: form.responsavelNome.trim(),
          responsavel_telefone: form.responsavelTelefone,
          email: form.email.trim(),
          cpf: form.cpf
        })
      })
      const json = await res.json()
      if (json.sucesso) setEnviado(true)
      else setErroEnvio(json.error || 'Não foi possível enviar. Tente de novo.')
    } catch {
      setErroEnvio('Não foi possível enviar. Verifique sua internet e tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  if (loading) {
    return (
      <Pagina>
        <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--color-brand)' }}>
          <Icon icon="eos-icons:loading" width="40" />
        </div>
      </Pagina>
    )
  }

  if (erro) {
    return (
      <Pagina>
        <Card elevation="elevated">
          <EmptyState variant="error" icon="mdi:link-variant-off" title="Link indisponível" description={erro} />
        </Card>
      </Pagina>
    )
  }

  if (enviado) {
    return (
      <Pagina>
        <Card elevation="elevated">
          <EmptyState
            variant="first-use"
            icon="mdi:check-circle-outline"
            title="Cadastro enviado!"
            description={`${empresa?.nome || 'A escola'} vai confirmar seus dados e te chamar no WhatsApp.`}
          />
        </Card>
      </Pagina>
    )
  }

  return (
    <Pagina>
      {/* Cabeçalho da escola */}
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
        {empresa?.logo_url ? (
          <img
            src={empresa.logo_url} alt=""
            style={{
              width: 72, height: 72, borderRadius: 'var(--radius-full)', objectFit: 'cover',
              margin: '0 auto var(--space-3)', display: 'block',
              background: 'var(--color-bg-surface)', boxShadow: 'var(--shadow-sm)'
            }}
          />
        ) : (
          <div style={{
            width: 64, height: 64, borderRadius: 'var(--radius-full)', background: 'var(--mensalli-green-50)',
            color: 'var(--color-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto var(--space-3)'
          }}>
            <Icon icon="mdi:account-plus-outline" width="32" />
          </div>
        )}
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)' }}>{empresa?.nome}</h1>
        <p style={{ margin: 'var(--space-1) 0 0', fontSize: 14, color: 'var(--color-text-secondary)' }}>
          Ficha de cadastro do aluno
        </p>
      </div>

      <Card elevation="elevated" padding="spacious">
        <form
          noValidate
          onSubmit={e => { e.preventDefault(); enviar() }}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
        >
          {/* Isca anti-robô: fora da tela, pessoas não veem nem tabulam até ela */}
          <input
            type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
            value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
            style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
          />

          <Input label="Nome" required placeholder="Ex: João Silva" autoComplete="name" {...campo('nome')} />

          <Input
            label="Data de nascimento" required placeholder="DD/MM/AAAA" inputMode="numeric"
            {...campo('dataNascimento', mascaraData)}
          />

          {/* Menor de idade (pela data): o contato passa a ser o responsável */}
          {menor ? (
            <>
              <div style={{
                display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start', fontSize: 13,
                color: 'var(--color-text-secondary)', background: 'var(--color-bg-muted)',
                borderRadius: 'var(--radius-md)', padding: 'var(--space-2-5) var(--space-3)'
              }}>
                <Icon icon="mdi:account-child-outline" width="18" style={{ flexShrink: 0, color: 'var(--color-brand)' }} />
                Aluno menor de idade: preencha os dados do responsável.
              </div>
              <Input label="Nome do responsável" required placeholder="Ex: Maria Silva" {...campo('responsavelNome')} />
              <Input
                label="WhatsApp do responsável" required type="tel" inputMode="tel" placeholder="(00) 00000-0000"
                icon="mdi:whatsapp" {...campo('responsavelTelefone', mascaraTelefone)}
              />
            </>
          ) : (
            <Input
              label="WhatsApp" required type="tel" inputMode="tel" placeholder="(00) 00000-0000" autoComplete="tel"
              icon="mdi:whatsapp" {...campo('telefone', mascaraTelefone)}
            />
          )}

          <Input label="E-mail" type="email" inputMode="email" placeholder="email@exemplo.com" autoComplete="email" {...campo('email')} />

          <Input
            label={menor ? 'CPF do aluno' : 'CPF'} inputMode="numeric" placeholder="000.000.000-00"
            {...campo('cpf', mascaraCPF)}
          />

          {erroEnvio && (
            <Card accent="danger" tinted padding="tight">
              <div style={{ display: 'flex', gap: 'var(--space-2)', fontSize: 14, color: 'var(--danger-700)' }}>
                <Icon icon="mdi:alert-circle-outline" width="18" style={{ flexShrink: 0, marginTop: 1 }} />
                {erroEnvio}
              </div>
            </Card>
          )}

          <Button type="submit" variant="primary" size="lg" fullWidth loading={enviando}>
            Enviar cadastro
          </Button>
        </form>
      </Card>

      <p style={{ textAlign: 'center', margin: 'var(--space-4) 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
        Seus dados vão só para {empresa?.nome || 'a escola'}.
      </p>
    </Pagina>
  )
}
