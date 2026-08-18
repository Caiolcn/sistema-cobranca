import { useState } from 'react'
import { supabase } from './supabaseClient'
import { useNavigate } from 'react-router-dom'
import { MdAutorenew, MdPayments, MdDashboardCustomize, MdCheckCircle } from 'react-icons/md'
import { trackLead, trackCompleteRegistration, trackStartTrial, enviarEventoCapi } from './utils/metaPixel'
import { obterAtribuicao, gerarEventId } from './utils/metaAttribution'
import whatsappService from './services/whatsappService'
import useWindowSize from './hooks/useWindowSize'

// Paleta do site público (mesma da LandingPage) — quem chega aqui vem de lá.
const INK = '#0f1115'
const BODY = '#5b636e'
const MUTED = '#9aa1ab'
const BORDER = '#ececf0'
const GREEN = '#16a34a'
const GRAD = 'linear-gradient(135deg, #22c55e 0%, #0ea372 100%)'
const GRAD_TEXT = 'linear-gradient(120deg, #16a34a, #0ea372)'

// O que a pessoa leva ao criar a conta. Fica ao lado do formulário porque muita
// gente cai direto aqui pelo anúncio, sem passar pela landing.
const BENEFICIOS = [
  {
    icon: MdAutorenew,
    titulo: 'A cobrança sai sozinha',
    desc: 'Avisa 3 dias antes, no dia e 3 depois do vencimento do seu próprio número, para de cobrar quando o pagamento for realizado e já cria a nova mensalidade tudo automaticamente.'
  },
  {
    icon: MdPayments,
    titulo: 'Pix, cartão ou boleto na conversa',
    desc: 'O link de pagamento vai junto da mensagem e a baixa acontece sozinha quando cai.'
  },
  {
    icon: MdDashboardCustomize,
    titulo: 'Alunos, agenda e financeiro',
    desc: 'Quem está em dia, quem deve, quem tem aula hoje e quanto entrou no mês sem planilha e na sua mão em segundos.'
  }
]

// Números reais da base, apurados em 13/08/2026. NÃO inventar nem arredondar
// pra cima: são prova social e precisam continuar verdadeiros.
// Para reapurar:
//   alunos  -> select count(*) from devedores where coalesce(lixo,false)=false
//   msgs    -> select count(*) from logs_mensagens
//   volume  -> select sum(valor) from mensalidades where status='pago' and coalesce(lixo,false)=false
const NUMEROS = [
  { valor: '+2.700', label: 'alunos cobrados pelo Mensalli' },
  { valor: '+8.500', label: 'mensagens de cobrança enviadas' },
  { valor: 'R$ 490 mil', label: 'em mensalidades administradas' }
]

const SELOS = ['Sai do seu próprio WhatsApp', 'Configura em ~5 minutos']

// Depoimentos REAIS de clientes. Só entram com autorização de quem falou —
// nada de frase inventada. Formato: { texto, autor, negocio }.
// Enquanto o array estiver vazio, o bloco simplesmente não aparece.
const DEPOIMENTOS = []

// Instância WhatsApp da própria plataforma (Mensalli → novo cliente).
// Mesma usada pelos disparos do /admin. O novo usuário ainda não conectou
// a instância dele, então a boas-vindas sai daqui.
// Fonte de verdade é config.evolution_master_instance; aqui fica só o mesmo
// fallback do resto do sistema, porque o cadastro não pode pagar uma query a
// mais no caminho crítico. Se trocar a master, trocar lá E aqui.
const INSTANCIA_MENSALLI = 'mensalli_master_v2'

// Prévia da cobrança logo no cadastro: a prova de valor mais barata que existe.
// Aqui ainda não há empresa, plano nem aluno cadastrado, então o exemplo usa
// dados fictícios de propósito — e o rodapé deixa explícito que é modelo
// editável, senão a pessoa acha que o sistema já saiu cobrando alguém.
const montarCobrancaExemplo = (primeiroNome) =>
`Olá, Maria.

Este é um lembrete referente à sua mensalidade:

📌 Plano Mensal
💰 R$ 150,00
📅 Vencimento: dia 10

🔑 Chave PIX: academia@exemplo.com.br

Estamos à disposição para qualquer esclarecimento.
━━━━━━━━━━━━━━━
${primeiroNome}, esta é uma cobrança de exemplo.

Vai ser assim que seus alunos vão receber, direto do seu WhatsApp. E todo esse texto você pode editar do jeito que você preferir dentro do Mensalli. ✏️`

export default function Signup({ onCadastroIniciado }) {
  const navigate = useNavigate()
  const { isSmallScreen } = useWindowSize()

  const [nomeCompleto, setNomeCompleto] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [focusField, setFocusField] = useState(null)
  const [mostrarSenha, setMostrarSenha] = useState(false)
  // Popup de fim de cadastro. `exemploFalhou` existe pra não mentir: se o envio
  // pelo master não completar, o texto troca em vez de afirmar que enviamos.
  const [mostrarConcluido, setMostrarConcluido] = useState(false)
  const [exemploFalhou, setExemploFalhou] = useState(false)

  const formatarTelefone = (valor) => {
    const nums = valor.replace(/\D/g, '').slice(0, 11)
    if (nums.length <= 2) return nums
    if (nums.length <= 7) return `(${nums.slice(0, 2)}) ${nums.slice(2)}`
    return `(${nums.slice(0, 2)}) ${nums.slice(2, 7)}-${nums.slice(7)}`
  }

  const getLimitePorPlano = (plano) => {
    const limites = { starter: 200, pro: 600, premium: 3000 }
    return limites[plano] || 600
  }

  const tratarErro = (error) => {
    if (error.message.includes('already registered')) {
      return 'Este email já está cadastrado. Faça login ou recupere sua senha.'
    }
    if (error.message.includes('invalid email')) {
      return 'Email inválido. Verifique e tente novamente.'
    }
    if (error.message.includes('weak password') || error.message.includes('Password should be at least')) {
      return 'Senha muito fraca. Use pelo menos 6 caracteres.'
    }
    return error.message || 'Erro ao criar conta. Tente novamente.'
  }

  const handleCadastro = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErro('')

    try {
      if (!nomeCompleto || nomeCompleto.trim().length < 3) {
        setErro('Nome deve ter pelo menos 3 caracteres')
        setLoading(false)
        return
      }

      const telefoneLimpo = telefone.replace(/\D/g, '')
      if (telefoneLimpo.length < 10 || telefoneLimpo.length > 11) {
        setErro('WhatsApp inválido. Use DDD + número.')
        setLoading(false)
        return
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        setErro('Email inválido')
        setLoading(false)
        return
      }

      if (senha.length < 6) {
        setErro('Senha deve ter pelo menos 6 caracteres')
        setLoading(false)
        return
      }

      const planoSelecionado = 'pro'

      // Daqui pra frente a sessão já existe: segura o redirect automático do
      // /signup pro /app/home até este fluxo mandar a pessoa pro onboarding.
      if (onCadastroIniciado) onCadastroIniciado()

      // O telefone vai no metadata porque quem cria a conta agora é o trigger
      // on_auth_user_created (handle_new_user) — ele lê daqui. Os upserts abaixo
      // só complementam o que o banco já criou.
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: senha,
        options: {
          data: {
            nome_completo: nomeCompleto,
            telefone: telefoneLimpo,
            plano: planoSelecionado
          }
        }
      })

      if (authError) throw authError

      const userId = authData.user.id

      // Rede de segurança: se o trigger tiver falhado, o upsert cria a linha.
      // Se o trigger funcionou (caso normal), isso só reescreve os mesmos dados.
      const { error: upsertError } = await supabase
        .from('usuarios')
        .upsert({
          id: userId,
          email: email,
          nome_completo: nomeCompleto,
          telefone: telefoneLimpo,
          plano: planoSelecionado,
          limite_mensal: getLimitePorPlano(planoSelecionado),
          trial_fim: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          trial_ativo: true,
          plano_pago: false,
          status_conta: 'ativo',
          // Toda conta nasce como "Minha Empresa": o passo de nomear a empresa
          // saiu do cadastro e virou item do onboarding da Home. Sem isso o campo
          // ficaria NULL (o trigger não preenche) e {{nomeEmpresa}} apareceria
          // vazio nos templates de mensagem.
          nome_empresa: 'Minha Empresa'
        }, { onConflict: 'id' })

      if (upsertError) throw new Error(`Database error: ${upsertError.message || upsertError.code}`)

      // controle_planos e configuracoes_cobranca têm UNIQUE(user_id) e já nascem
      // pelo trigger. Precisa ser upsert com ignoreDuplicates, nunca insert:
      // um insert cru colidiria (23505) e derrubaria o cadastro inteiro.
      const mesReferencia = new Date().toISOString().slice(0, 7)
      const { error: controleError } = await supabase
        .from('controle_planos')
        .upsert({
          user_id: userId,
          plano: planoSelecionado,
          limite_mensal: getLimitePorPlano(planoSelecionado),
          usage_count: 0,
          mes_referencia: mesReferencia,
          status: 'ativo'
        }, { onConflict: 'user_id', ignoreDuplicates: true })

      if (controleError) console.error('Erro ao criar controle de plano:', controleError)

      const { error: configError } = await supabase
        .from('configuracoes_cobranca')
        .upsert({
          user_id: userId,
          enviar_no_dia: true,
          enviar_3_dias_antes: true,
          enviar_3_dias_depois: true
        }, { onConflict: 'user_id', ignoreDuplicates: true })

      if (configError) console.error('Erro ao criar config de cobrança:', configError)

      // Atribuição: grava o clique que trouxe essa pessoa (fbp/fbc/UTM). É o que
      // permite ao Purchase — que só acontece dias depois, pelo webhook, sem
      // navegador nenhum aberto — ser creditado à campanha certa lá na frente.
      const atribuicao = obterAtribuicao()
      if (atribuicao) {
        const { error: atribError } = await supabase
          .from('meta_atribuicao')
          .upsert({
            user_id: userId,
            fbp: atribuicao.fbp,
            fbc: atribuicao.fbc,
            fbclid: atribuicao.fbclid,
            utm_source: atribuicao.utm_source,
            utm_medium: atribuicao.utm_medium,
            utm_campaign: atribuicao.utm_campaign,
            utm_content: atribuicao.utm_content,
            utm_term: atribuicao.utm_term,
            landing_url: atribuicao.landing_url,
            user_agent: atribuicao.user_agent
          }, { onConflict: 'user_id' })

        if (atribError) console.error('Erro ao gravar atribuição Meta:', atribError)
      }

      // Pixel PRIMEIRO: a conta já foi criada, então dispara os eventos de conversão
      // imediatamente — a campanha Meta paga por CompleteRegistration, não pode
      // depender do await da boas-vindas (que pode travar/demorar).
      // O mesmo eventId vai pelo navegador e pelo servidor: o Meta deduplica.
      const eventIdCadastro = gerarEventId('cadastro')
      trackLead()
      trackCompleteRegistration(eventIdCadastro)
      trackStartTrial()

      // Cópia server-side, sem await: recupera os ~20-30% de cadastros que o
      // navegador perde (adblock, ITP do Safari, aba fechada cedo demais).
      enviarEventoCapi('CompleteRegistration', { eventId: eventIdCadastro })

      // Boas-vindas via WhatsApp, enviada pelo número da plataforma (master).
      // Sem await de propósito: o envio pode levar segundos e não pode atrasar a
      // ida pro onboarding. Se falhar, a conta já está criada e a pessoa segue.
      const primeiroNome = nomeCompleto.trim().split(' ')[0]
      const mensagemBoasVindas =
`Oi ${primeiroNome}! 👋

Aqui é o Caio, da equipe do Mensalli. Vi que você acabou de criar sua conta — seja muito bem-vindo(a)! 🎉

Sua conta já está com tudo desbloqueado. Pra ver a mágica acontecer, é só cadastrar seus alunos e ativar a cobrança automática no WhatsApp.

Ficou com qualquer dúvida na hora de configurar? Pode responder aqui mesmo que eu te ajudo. 😊`

      // Boas-vindas e exemplo saem em sequência (não em paralelo) só pra chegarem
      // na ordem certa na conversa. Sem await no fluxo principal: o popup aparece
      // na hora e o envio segue por fora.
      ;(async () => {
        try {
          await whatsappService.enviarMensagem(telefoneLimpo, mensagemBoasVindas, INSTANCIA_MENSALLI)
        } catch (erroBoasVindas) {
          console.error('Falha ao enviar boas-vindas (não bloqueia cadastro):', erroBoasVindas)
        }
        try {
          const resultado = await whatsappService.enviarMensagem(
            telefoneLimpo,
            montarCobrancaExemplo(primeiroNome),
            INSTANCIA_MENSALLI
          )
          // O service resolve com { sucesso: false } em vez de rejeitar em parte
          // dos erros — se não checar, o popup afirma que enviou e não enviou.
          if (resultado && resultado.sucesso === false) throw new Error(resultado.erro || 'envio recusado')
        } catch (erroExemplo) {
          console.error('Falha ao enviar cobrança de exemplo:', erroExemplo)
          setExemploFalhou(true)
        }
      })()

      setMostrarConcluido(true)

    } catch (error) {
      console.error('Erro ao cadastrar:', error)
      setErro(tratarErro(error))
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = (field) => ({
    width: '100%',
    padding: '14px 16px',
    border: `2px solid ${focusField === field ? '#25D366' : '#e8e8e8'}`,
    borderRadius: '10px',
    // 16px é o mínimo que impede o Safari do iOS de dar zoom ao focar o campo
    fontSize: '16px',
    boxSizing: 'border-box',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    backgroundColor: '#fafafa',
    boxShadow: focusField === field ? '0 0 0 3px rgba(37, 211, 102, 0.1)' : 'none'
  })

  const painelValor = (
    <aside style={{
      // No celular o formulário vem primeiro: quem chegou aqui já decidiu criar
      // a conta, a explicação serve de reforço logo abaixo.
      order: isSmallScreen ? 2 : 1,
      maxWidth: isSmallScreen ? '440px' : '100%',
      width: '100%',
      margin: '0 auto'
    }}>
      <h1 style={{
        fontSize: isSmallScreen ? '22px' : '38px',
        fontWeight: '800',
        lineHeight: 1.15,
        letterSpacing: isSmallScreen ? '-0.6px' : '-1.4px',
        color: INK,
        margin: '0 0 14px',
        textAlign: isSmallScreen ? 'center' : 'left'
      }}>
        A mensalidade cobra <span style={{
          background: GRAD_TEXT,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>sozinha</span>, pelo seu WhatsApp.
      </h1>
      <p style={{
        fontSize: isSmallScreen ? '15px' : '17px',
        color: BODY,
        lineHeight: 1.6,
        margin: '0 0 28px',
        textAlign: isSmallScreen ? 'center' : 'left'
      }}>
        Você cadastra o aluno e a data de vencimento uma vez, e o resto o Mensalli faz
        por você. Lembrar, cobrar, receber e dar baixa. Feito para academias, estúdios,
        escolas e professores que vivem de mensalidade.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginBottom: '30px' }}>
        {BENEFICIOS.map(({ icon: Icone, titulo, desc }) => (
          <div key={titulo} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <span style={{
              flexShrink: 0,
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: GRAD,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Icone size={19} color="white" />
            </span>
            <div>
              <p style={{ margin: '0 0 3px', fontSize: '15px', fontWeight: '700', color: INK }}>{titulo}</p>
              <p style={{ margin: 0, fontSize: '14px', color: BODY, lineHeight: 1.55 }}>{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Prova social: números da nossa própria base, não média de mercado */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '12px',
        padding: '20px 18px',
        backgroundColor: 'white',
        border: `1px solid ${BORDER}`,
        borderRadius: '14px',
        marginBottom: '16px'
      }}>
        {NUMEROS.map(({ valor, label }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <p style={{
              margin: '0 0 4px',
              fontSize: isSmallScreen ? '17px' : '20px',
              fontWeight: '800',
              letterSpacing: '-0.6px',
              background: GRAD_TEXT,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>
              {valor}
            </p>
            <p style={{ margin: 0, fontSize: '11.5px', color: MUTED, lineHeight: 1.4 }}>{label}</p>
          </div>
        ))}
      </div>

      {DEPOIMENTOS.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
          {DEPOIMENTOS.map(({ texto, autor, negocio }) => (
            <blockquote key={autor} style={{
              margin: 0,
              padding: '16px 18px',
              backgroundColor: 'white',
              border: `1px solid ${BORDER}`,
              borderLeft: `3px solid ${GREEN}`,
              borderRadius: '12px'
            }}>
              <p style={{ margin: '0 0 8px', fontSize: '14px', color: INK, lineHeight: 1.6 }}>“{texto}”</p>
              <footer style={{ fontSize: '12.5px', color: MUTED }}>{autor} · {negocio}</footer>
            </blockquote>
          ))}
        </div>
      )}

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px 18px',
        justifyContent: isSmallScreen ? 'center' : 'flex-start'
      }}>
        {SELOS.map((selo) => (
          <span key={selo} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: BODY }}>
            <MdCheckCircle size={15} style={{ color: GREEN }} /> {selo}
          </span>
        ))}
      </div>
    </aside>
  )

  return (
    <div style={{
      // dvh em vez de vh: no Safari do iOS o 100vh conta a barra de endereço
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f8faf9',
      padding: isSmallScreen ? '20px' : '40px 20px',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Fim do cadastro: no lugar do antigo wizard de 4 passos, só este aviso.
          O resto da configuração virou o painel de onboarding da Home. */}
      {mostrarConcluido && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          backgroundColor: 'rgba(15, 17, 21, 0.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '440px',
            backgroundColor: 'white',
            borderRadius: '18px',
            padding: 'clamp(24px, 7vw, 36px)',
            textAlign: 'center',
            boxShadow: '0 24px 60px rgba(15, 17, 21, 0.22)'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: GRAD,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 18px'
            }}>
              <MdCheckCircle size={34} style={{ color: 'white' }} />
            </div>

            <h2 style={{ margin: '0 0 12px', fontSize: '22px', fontWeight: 700, color: INK }}>
              Conta criada! 🎉
            </h2>

            <p style={{ margin: '0 0 10px', fontSize: '15px', lineHeight: 1.6, color: BODY }}>
              {exemploFalhou ? (
                <>Daqui a pouco chega no seu WhatsApp <strong style={{ color: INK }}>{telefone}</strong> uma
                cobrança de exemplo, igualzinha à que seus alunos vão receber — só que saindo do <strong style={{ color: INK }}>seu</strong> número.</>
              ) : (
                <>Enviamos uma cobrança de exemplo no seu WhatsApp <strong style={{ color: INK }}>{telefone}</strong>.
                Dá uma olhada no celular: é exatamente assim que seus alunos vão receber — só que saindo do <strong style={{ color: INK }}>seu</strong> número.</>
              )}
            </p>

            <p style={{ margin: '0 0 24px', fontSize: '14px', lineHeight: 1.6, color: MUTED }}>
              E fica tranquilo: nenhum aluno recebeu nada, e todas as mensagens são editáveis — você escreve do seu jeito lá dentro. ✏️
            </p>

            <button
              onClick={() => navigate('/app/home', { replace: true })}
              style={{
                width: '100%',
                padding: '15px',
                background: GRAD,
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Ir para minha conta
            </button>
          </div>
        </div>
      )}

      <div style={{
        width: '100%',
        maxWidth: '980px',
        marginBottom: isSmallScreen ? '20px' : '28px',
        display: 'flex',
        // Só a logo é clicável; sem isso a faixa inteira vira link pra home
        justifyContent: isSmallScreen ? 'center' : 'flex-start'
      }}>
        <a href="/" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
          <img
            src="/Logo-Full.png"
            alt="Mensalli"
            style={{ height: '44px', width: 'auto' }}
          />
        </a>
      </div>

      {/* No celular o painel de valor fica embaixo do formulário, então acima da
          dobra sobra só isso pra dizer do que se trata. */}
      {isSmallScreen && (
        <p style={{
          margin: '-8px 0 16px',
          fontSize: '13px',
          fontWeight: '600',
          color: GREEN,
          textAlign: 'center'
        }}>
          Cobrança automática pelo WhatsApp
        </p>
      )}

      <div style={{
        width: '100%',
        maxWidth: '980px',
        display: 'grid',
        gridTemplateColumns: isSmallScreen ? '1fr' : 'minmax(0, 1fr) 420px',
        gap: isSmallScreen ? '32px' : '56px',
        alignItems: 'center'
      }}>
        {painelValor}

        <div style={{
          order: isSmallScreen ? 1 : 2,
          backgroundColor: 'white',
          // clamp encolhe o respiro no celular: com 40px fixos o botão "Criar conta"
          // nascia abaixo da dobra num iPhone SE
          padding: 'clamp(24px, 7vw, 36px)',
          borderRadius: '16px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          border: '1px solid #eee',
          maxWidth: '440px',
          width: '100%',
          margin: '0 auto',
          boxSizing: 'border-box'
        }}>
          <h2 style={{
            textAlign: 'center',
            marginBottom: '8px',
            color: '#1a1a1a',
            fontSize: '24px',
            fontWeight: '700'
          }}>
            Crie sua conta
          </h2>
          <p style={{
            textAlign: 'center',
            marginBottom: '28px',
            color: '#888',
            fontSize: '14px',
            lineHeight: '1.5'
          }}>
            Leva 1 minuto e já dá pra deixar a primeira cobrança agendada hoje
          </p>

          {erro && (
            <div style={{
              marginBottom: '20px',
              padding: '12px 16px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '10px',
              color: '#dc2626',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ fontSize: '16px' }}>!</span>
              {erro}
            </div>
          )}

          <form onSubmit={handleCadastro}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', color: '#444', fontSize: '13px', fontWeight: '600' }}>
                Seu nome
              </label>
              <input
                type="text"
                value={nomeCompleto}
                onChange={(e) => setNomeCompleto(e.target.value)}
                placeholder="Como seus clientes te conhecem"
                required
                autoComplete="name"
                onFocus={() => setFocusField('nome')}
                onBlur={() => setFocusField(null)}
                style={inputStyle('nome')}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', color: '#444', fontSize: '13px', fontWeight: '600' }}>
                WhatsApp
              </label>
              <input
                type="tel"
                value={telefone}
                onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
                placeholder="(11) 99999-9999"
                required
                autoComplete="tel-national"
                inputMode="numeric"
                onFocus={() => setFocusField('telefone')}
                onBlur={() => setFocusField(null)}
                style={inputStyle('telefone')}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', color: '#444', fontSize: '13px', fontWeight: '600' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                onFocus={() => setFocusField('email')}
                onBlur={() => setFocusField(null)}
                style={inputStyle('email')}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '6px', color: '#444', fontSize: '13px', fontWeight: '600' }}>
                Senha
              </label>
              {/* Toggle de ver a senha: no celular, errar a senha aqui e só
                  descobrir no primeiro login é motivo comum de abandono. */}
              <div style={{ position: 'relative' }}>
                <input
                  type={mostrarSenha ? 'text' : 'password'}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  autoComplete="new-password"
                  onFocus={() => setFocusField('senha')}
                  onBlur={() => setFocusField(null)}
                  style={{ ...inputStyle('senha'), paddingRight: '48px' }}
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(!mostrarSenha)}
                  aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  style={{
                    position: 'absolute',
                    right: '14px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    color: '#999',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  // App.css pinta todo button de azul no hover; neutraliza aqui
                  onMouseOver={(e) => { e.currentTarget.style.background = 'none' }}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    {mostrarSenha ? (
                      <path d="M10 4C5 4 1.73 7.11 1 10c.73 2.89 4 6 9 6s8.27-3.11 9-6c-.73-2.89-4-6-9-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                    ) : (
                      <path d="M10 4C5 4 1.73 7.11 1 10c.73 2.89 4 6 9 6s8.27-3.11 9-6c-.73-2.89-4-6-9-6zM2 10c.7-2.24 3.39-5 8-5s7.3 2.76 8 5c-.7 2.24-3.39 5-8 5s-7.3-2.76-8-5zm8 3c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/>
                    )}
                  </svg>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '15px',
                backgroundColor: loading ? '#9ca3af' : '#25D366',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                boxShadow: loading ? 'none' : '0 4px 14px rgba(37, 211, 102, 0.3)'
              }}
              onMouseOver={(e) => { if (!loading) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(37, 211, 102, 0.4)' } }}
              onMouseOut={(e) => { if (!loading) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(37, 211, 102, 0.3)' } }}
            >
              {loading ? 'Criando conta...' : 'Criar conta'}
            </button>
          </form>

          <p style={{
            textAlign: 'center',
            marginTop: '12px',
            fontSize: '12px',
            color: '#aaa',
            lineHeight: '1.5'
          }}>
            Ao criar sua conta, você concorda com nossos Termos de Uso
          </p>

          <div style={{
            marginTop: '20px',
            paddingTop: '20px',
            borderTop: '1px solid #f0f0f0',
            textAlign: 'center'
          }}>
            <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>
              Já tem uma conta?{' '}
              <a
                href="/login"
                style={{
                  color: '#25D366',
                  fontWeight: '600',
                  textDecoration: 'none'
                }}
                onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
                onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}
              >
                Entrar
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
