import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { showToast } from './Toast'
import ConfirmModal from './ConfirmModal'
import { SkeletonList } from './components/Skeleton'
import useWindowSize from './hooks/useWindowSize'
import { useUser } from './contexts/UserContext'
import Input from './design-system/components/Input'
import Select from './design-system/components/Select'
import DateField from './components/DateField'

// ==========================================
// Configuração > Colaboradores
// CRUD da tabela `colaboradores` (professores, coordenadores, recepcionistas).
// Usado pelo dropdown "Professor" das aulas na Agenda.
// + Ficha cadastral (dados pessoais + endereço), todos opcionais.
// ==========================================

const CARGOS_PADRAO = ['Professor', 'Coordenador', 'Recepcionista']

export default function ColaboradoresConfig() {
  const { isMobile } = useWindowSize()
  const { userId } = useUser()

  const [colaboradores, setColaboradores] = useState([])
  const [loading, setLoading] = useState(true)

  const [modal, setModal] = useState(null) // null | { editando: colaborador | null }
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cargo, setCargo] = useState('Professor')
  // Ficha cadastral (dados pessoais + endereço) — todos opcionais
  const [email, setEmail] = useState('')
  const [cpf, setCpf] = useState('')
  const [dataNascimento, setDataNascimento] = useState('')
  const [cep, setCep] = useState('')
  const [endereco, setEndereco] = useState('')
  const [numero, setNumero] = useState('')
  const [complemento, setComplemento] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [estado, setEstado] = useState('')
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  // Máscaras — mesma lógica do cadastro de aluno (Clientes.js)
  const formatarTelefone = (value) => {
    const numbers = value.replace(/\D/g, '')
    if (numbers.length <= 11) {
      return numbers
        .replace(/^(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2')
    }
    return value
  }

  const formatarCpf = (value) => {
    const numeros = value.replace(/\D/g, '').slice(0, 11)
    if (numeros.length <= 3) return numeros
    if (numeros.length <= 6) return numeros.replace(/(\d{3})(\d+)/, '$1.$2')
    if (numeros.length <= 9) return numeros.replace(/(\d{3})(\d{3})(\d+)/, '$1.$2.$3')
    return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d+)/, '$1.$2.$3-$4')
  }

  const formatarCep = (value) => {
    const numeros = value.replace(/\D/g, '').slice(0, 8)
    if (numeros.length <= 5) return numeros
    return numeros.replace(/(\d{5})(\d+)/, '$1-$2')
  }

  const buscarCep = async (valor) => {
    const apenasNumeros = valor.replace(/\D/g, '')
    if (apenasNumeros.length !== 8) return
    setBuscandoCep(true)
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${apenasNumeros}/json/`)
      const data = await resp.json()
      if (data.erro) { showToast('CEP não encontrado', 'warning'); return }
      setEndereco(data.logradouro || '')
      setBairro(data.bairro || '')
      setCidade(data.localidade || '')
      setEstado(data.uf || '')
    } catch {
      showToast('Erro ao buscar CEP', 'error')
    } finally {
      setBuscandoCep(false)
    }
  }

  const carregar = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const { data } = await supabase.from('colaboradores')
      .select('*').eq('user_id', userId)
      .order('ativo', { ascending: false }).order('nome')
    setColaboradores(data || [])
    setLoading(false)
  }, [userId])

  useEffect(() => { carregar() }, [carregar])

  const limparFicha = () => {
    setEmail(''); setCpf(''); setDataNascimento('')
    setCep(''); setEndereco(''); setNumero(''); setComplemento('')
    setBairro(''); setCidade(''); setEstado('')
  }

  const abrirNovo = () => {
    setNome(''); setTelefone(''); setCargo('Professor')
    limparFicha()
    setModal({ editando: null })
  }

  const abrirEditar = (c) => {
    setNome(c.nome || '')
    setTelefone(c.telefone || '')
    setCargo(c.cargo || 'Professor')
    setEmail(c.email || '')
    setCpf(c.cpf || '')
    setDataNascimento(c.data_nascimento || '')
    setCep(c.cep || '')
    setEndereco(c.endereco || '')
    setNumero(c.numero || '')
    setComplemento(c.complemento || '')
    setBairro(c.bairro || '')
    setCidade(c.cidade || '')
    setEstado(c.estado || '')
    setModal({ editando: c })
  }

  const salvar = async () => {
    if (!nome.trim()) { showToast('Informe o nome', 'warning'); return }
    const cargoFinal = (cargo || '').trim()
    if (!cargoFinal) { showToast('Informe o cargo', 'warning'); return }

    setSalvando(true)
    const payload = {
      nome: nome.trim(),
      telefone: telefone.trim() || null,
      cargo: cargoFinal,
      email: email.trim() || null,
      cpf: cpf.trim() || null,
      data_nascimento: dataNascimento || null,
      cep: cep.trim() || null,
      endereco: endereco.trim() || null,
      numero: numero.trim() || null,
      complemento: complemento.trim() || null,
      bairro: bairro.trim() || null,
      cidade: cidade.trim() || null,
      estado: estado.trim() || null,
      updated_at: new Date().toISOString()
    }

    if (modal.editando) {
      const { data, error } = await supabase.from('colaboradores')
        .update(payload).eq('id', modal.editando.id).select()
      setSalvando(false)
      if (error) { showToast('Erro ao salvar: ' + error.message, 'error'); return }
      setColaboradores(prev => prev.map(c => c.id === modal.editando.id ? { ...c, ...data[0] } : c))
      showToast('Colaborador atualizado!', 'success')
    } else {
      const { data, error } = await supabase.from('colaboradores')
        .insert({ ...payload, user_id: userId }).select()
      setSalvando(false)
      if (error) { showToast('Erro ao criar: ' + error.message, 'error'); return }
      setColaboradores(prev => [...(data || []), ...prev])
      showToast('Colaborador adicionado!', 'success')
    }
    setModal(null)
  }

  const toggleAtivo = async (c, valor) => {
    const novo = valor !== undefined ? valor : !c.ativo
    // update otimista
    setColaboradores(prev => prev.map(x => x.id === c.id ? { ...x, ativo: novo } : x))
    const { error } = await supabase.from('colaboradores')
      .update({ ativo: novo, updated_at: new Date().toISOString() }).eq('id', c.id)
    if (error) {
      showToast('Erro: ' + error.message, 'error')
      setColaboradores(prev => prev.map(x => x.id === c.id ? { ...x, ativo: !novo } : x))
    }
  }

  const excluir = async (c) => {
    const { error } = await supabase.from('colaboradores').delete().eq('id', c.id)
    if (error) { showToast('Erro ao excluir: ' + error.message, 'error'); return }
    setColaboradores(prev => prev.filter(x => x.id !== c.id))
    showToast('Colaborador removido!', 'success')
    setConfirmDelete(null)
    setModal(null)
  }

  // Inclui o cargo atual nas opções (cargos personalizados aparecem selecionados ao editar)
  const cargoOptions = [...new Set([...CARGOS_PADRAO, cargo].filter(Boolean))]
    .map(c => ({ value: c, label: c }))

  const localidade = (c) => {
    if (!c.cidade) return null
    return c.estado ? `${c.cidade}/${c.estado}` : c.cidade
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: isMobile ? '15px' : '16px', fontWeight: '600', color: '#344848' }}>
            Colaboradores
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#666' }}>
            Cadastre professores e demais colaboradores pra vincular às turmas da agenda.
          </p>
        </div>
        <button onClick={abrirNovo}
          style={{
            padding: '9px 18px', backgroundColor: '#333', color: 'white', border: 'none', borderRadius: '8px',
            fontSize: '13px', fontWeight: '600', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px'
          }}>
          <Icon icon="mdi:plus" width="16" /> Novo colaborador
        </button>
      </div>

      {loading ? (
        <SkeletonList count={4} />
      ) : colaboradores.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#999', border: '1px dashed #e5e7eb', borderRadius: '12px' }}>
          <Icon icon="mdi:account-tie-outline" width="40" style={{ color: '#ddd' }} />
          <p style={{ fontSize: '14px', fontWeight: '500', color: '#666', margin: '10px 0 2px' }}>
            Nenhum colaborador cadastrado
          </p>
          <p style={{ fontSize: '13px', margin: 0 }}>
            Clique em "Novo colaborador" para começar.
          </p>
        </div>
      ) : isMobile ? (
        /* ===== Mobile: cards clicáveis ===== */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {colaboradores.map(c => (
            <div key={c.id} onClick={() => abrirEditar(c)} style={{
              display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer',
              padding: '12px 14px', border: '1px solid #eee', borderRadius: '10px',
              backgroundColor: c.ativo ? '#fff' : '#fafafa', opacity: c.ativo ? 1 : 0.7
            }}>
              <div style={avatarStyle}>{(c.nome || 'C').charAt(0).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  {c.nome}
                  {!c.ativo && <span style={inativoTag}>Inativo</span>}
                </div>
                <div style={{ fontSize: '12px', color: '#888', display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '2px' }}>
                  <span style={{ color: '#4338ca' }}>{c.cargo}</span>
                  {c.telefone && <span>· {c.telefone}</span>}
                  {c.email && <span>· {c.email}</span>}
                  {localidade(c) && <span>· {localidade(c)}</span>}
                </div>
              </div>
              <AtivoToggle ativo={c.ativo} onToggle={(v) => toggleAtivo(c, v)} />
            </div>
          ))}
        </div>
      ) : (
        /* ===== Desktop: tabela ===== */
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ ...thStyle, textAlign: 'left' }}>Colaborador</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Cargo</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Telefone</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>E-mail</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Cidade</th>
                <th style={{ ...thStyle, textAlign: 'center', width: '90px' }}>Ativo</th>
              </tr>
            </thead>
            <tbody>
              {colaboradores.map(c => (
                <tr key={c.id}
                  onClick={() => abrirEditar(c)}
                  style={{ borderBottom: '1px solid #f0f0f0', cursor: 'pointer', transition: 'background-color 0.15s', opacity: c.ativo ? 1 : 0.6 }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9f9f9'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                >
                  <td style={{ padding: '14px 16px', fontSize: '14px', color: '#333' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={avatarStyle}>{(c.nome || 'C').charAt(0).toUpperCase()}</div>
                      <span style={{ fontWeight: '500', display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {c.nome}
                        {!c.ativo && <span style={inativoTag}>Inativo</span>}
                      </span>
                    </div>
                  </td>
                  <td style={tdStyle}><span style={{ color: '#4338ca', fontWeight: '500' }}>{c.cargo}</span></td>
                  <td style={tdStyle}>{c.telefone || <span style={mutedDash}>—</span>}</td>
                  <td style={tdStyle}>{c.email || <span style={mutedDash}>—</span>}</td>
                  <td style={tdStyle}>{localidade(c) || <span style={mutedDash}>—</span>}</td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <AtivoToggle ativo={c.ativo} onToggle={(v) => toggleAtivo(c, v)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal add/edit */}
      {modal && (
        <div onClick={e => { if (e.target === e.currentTarget) setModal(null) }}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: '20px'
          }}>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '460px', maxHeight: '90vh', overflowY: 'auto', overflowX: 'hidden', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
                {modal.editando ? 'Editar colaborador' : 'Novo colaborador'}
              </h3>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <Icon icon="mdi:close" width="20" style={{ color: '#999' }} />
              </button>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <Input size="md" label="Nome" required value={nome}
                onChange={e => setNome(e.target.value)}
                placeholder="Ex: João da Silva" />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
              <Input size="md" label="Telefone" type="tel" maxLength={15}
                value={telefone}
                onChange={e => setTelefone(formatarTelefone(e.target.value))}
                placeholder="(11) 99999-9999" style={{ flex: 1, minWidth: 0 }} />
              <Select size="md" label="Cargo" required portal searchable
                options={cargoOptions} value={cargo} onChange={setCargo}
                onCreate={(txt) => { if (txt.trim()) setCargo(txt.trim()) }}
                createLabel="Usar cargo" searchPlaceholder="Buscar ou criar…"
                style={{ flex: 1, minWidth: 0 }} />
            </div>

            {/* ===== Dados pessoais (ficha — todos opcionais) ===== */}
            <div style={sectionLabel}>Dados pessoais</div>

            <div style={{ marginBottom: '14px' }}>
              <Input size="md" label="E-mail" type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="email@exemplo.com" />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
              <Input size="md" label="CPF" maxLength={14} value={cpf}
                onChange={e => setCpf(formatarCpf(e.target.value))}
                placeholder="000.000.000-00" style={{ flex: 1, minWidth: 0 }} />
              <DateField label="Nascimento" value={dataNascimento}
                onChange={setDataNascimento} style={{ flex: 1, minWidth: 0 }} />
            </div>

            {/* ===== Endereço (ficha — todos opcionais) ===== */}
            <div style={sectionLabel}>Endereço</div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
              <Input size="md" label="CEP" maxLength={9} value={cep} loading={buscandoCep}
                onChange={e => setCep(formatarCep(e.target.value))}
                onBlur={e => buscarCep(e.target.value)}
                placeholder="00000-000" style={{ flex: 1, minWidth: 0 }} />
              <Input size="md" label="Endereço" value={endereco}
                onChange={e => setEndereco(e.target.value)}
                placeholder="Rua / Avenida" style={{ flex: 2, minWidth: 0 }} />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
              <Input size="md" label="Número" value={numero}
                onChange={e => setNumero(e.target.value)}
                placeholder="123" style={{ flex: 1, minWidth: 0 }} />
              <Input size="md" label="Complemento" value={complemento}
                onChange={e => setComplemento(e.target.value)}
                placeholder="Apto, bloco..." style={{ flex: 2, minWidth: 0 }} />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
              <Input size="md" label="Bairro" value={bairro}
                onChange={e => setBairro(e.target.value)} style={{ flex: 2, minWidth: 0 }} />
              <Input size="md" label="Cidade" value={cidade}
                onChange={e => setCidade(e.target.value)} style={{ flex: 2, minWidth: 0 }} />
              <Input size="md" label="UF" maxLength={2} value={estado}
                onChange={e => setEstado(e.target.value.toUpperCase())}
                placeholder="SP" style={{ flex: 1, minWidth: 0 }} />
            </div>

            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
              marginTop: '24px', paddingTop: modal.editando ? '18px' : '0',
              borderTop: modal.editando ? '1px solid #f0f0f0' : 'none'
            }}>
              {modal.editando ? (
                <button
                  onClick={() => setConfirmDelete(modal.editando)}
                  style={{
                    padding: '10px 16px', backgroundColor: 'transparent', color: '#ef4444',
                    border: '1.5px solid #ef4444', borderRadius: '8px', cursor: 'pointer',
                    fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px',
                    transition: 'all 0.2s', flexShrink: 0
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#ef4444'; e.currentTarget.style.color = 'white' }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#ef4444' }}
                >
                  <Icon icon="mdi:delete-outline" width="18" /> Excluir
                </button>
              ) : <span />}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setModal(null)} style={{
                  padding: '11px 18px', backgroundColor: '#f3f4f6', color: '#555',
                  border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600'
                }}>Cancelar</button>
                <button onClick={salvar} disabled={salvando}
                  style={{
                    padding: '11px 22px',
                    backgroundColor: salvando ? '#ccc' : '#344848', color: 'white',
                    border: 'none', borderRadius: '8px',
                    cursor: salvando ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '600'
                  }}>
                  {salvando ? 'Salvando...' : (modal.editando ? 'Salvar' : 'Adicionar')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => excluir(confirmDelete)}
        title="Excluir colaborador"
        message={`Tem certeza que deseja excluir ${confirmDelete?.nome || 'este colaborador'}? Turmas vinculadas a ele ficarão sem professor.`}
        confirmText="Excluir"
        confirmColor="#ef4444"
      />
    </div>
  )
}

// Toggle Ativo/Inativo na linha — mesmo visual do switch de assinatura do aluno
function AtivoToggle({ ativo, onToggle }) {
  return (
    <div onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
      <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '22px', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={!!ativo}
          onChange={(e) => { e.stopPropagation(); onToggle(e.target.checked) }}
          onClick={(e) => e.stopPropagation()}
          style={{ opacity: 0, width: 0, height: 0 }}
          title={ativo ? 'Desativar colaborador' : 'Ativar colaborador'}
        />
        <span style={{
          position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: ativo ? '#4CAF50' : '#ccc', transition: '0.3s', borderRadius: '22px'
        }}>
          <span style={{
            position: 'absolute', height: '16px', width: '16px',
            left: ativo ? '25px' : '3px', bottom: '3px',
            backgroundColor: 'white', transition: '0.3s', borderRadius: '50%'
          }} />
        </span>
      </label>
    </div>
  )
}

const avatarStyle = {
  width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
  backgroundColor: '#eef2ff', color: '#4338ca',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: '14px', fontWeight: '700'
}
const thStyle = {
  padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: '#666', textTransform: 'uppercase'
}
const tdStyle = {
  padding: '14px 16px', fontSize: '14px', color: '#555'
}
const mutedDash = { color: '#ccc' }
const inativoTag = {
  fontSize: '11px', fontWeight: '600', color: '#dc2626',
  backgroundColor: '#fef2f2', padding: '1px 7px', borderRadius: '8px'
}
const sectionLabel = {
  fontSize: '12px', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase',
  letterSpacing: '0.4px', margin: '20px 0 12px', paddingTop: '14px', borderTop: '1px solid #f0f0f0'
}
