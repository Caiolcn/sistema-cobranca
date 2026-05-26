import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { showToast } from './Toast'
import ConfirmModal from './ConfirmModal'
import { SkeletonList } from './components/Skeleton'
import useWindowSize from './hooks/useWindowSize'
import { useUser } from './contexts/UserContext'

// ==========================================
// Configuração > Colaboradores
// CRUD da tabela `colaboradores` (professores, coordenadores, recepcionistas).
// Usado pelo dropdown "Professor" das aulas na Agenda.
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
  const [cargoOutro, setCargoOutro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

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

  const abrirNovo = () => {
    setNome(''); setTelefone(''); setCargo('Professor'); setCargoOutro('')
    setModal({ editando: null })
  }

  const abrirEditar = (c) => {
    setNome(c.nome || '')
    setTelefone(c.telefone || '')
    if (CARGOS_PADRAO.includes(c.cargo)) {
      setCargo(c.cargo); setCargoOutro('')
    } else {
      setCargo('Outro'); setCargoOutro(c.cargo || '')
    }
    setModal({ editando: c })
  }

  const salvar = async () => {
    if (!nome.trim()) { showToast('Informe o nome', 'warning'); return }
    const cargoFinal = cargo === 'Outro' ? cargoOutro.trim() : cargo
    if (!cargoFinal) { showToast('Informe o cargo', 'warning'); return }

    setSalvando(true)
    const payload = {
      nome: nome.trim(),
      telefone: telefone.trim() || null,
      cargo: cargoFinal,
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

  const toggleAtivo = async (c) => {
    const { error } = await supabase.from('colaboradores')
      .update({ ativo: !c.ativo, updated_at: new Date().toISOString() })
      .eq('id', c.id)
    if (error) { showToast('Erro: ' + error.message, 'error'); return }
    setColaboradores(prev => prev.map(x => x.id === c.id ? { ...x, ativo: !x.ativo } : x))
  }

  const excluir = async (c) => {
    const { error } = await supabase.from('colaboradores').delete().eq('id', c.id)
    if (error) { showToast('Erro ao excluir: ' + error.message, 'error'); return }
    setColaboradores(prev => prev.filter(x => x.id !== c.id))
    showToast('Colaborador removido!', 'success')
    setConfirmDelete(null)
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
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {colaboradores.map(c => (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '12px 16px', border: '1px solid #eee', borderRadius: '10px',
              backgroundColor: c.ativo ? '#fff' : '#fafafa', opacity: c.ativo ? 1 : 0.65
            }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
                backgroundColor: '#eef2ff', color: '#4338ca',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '15px', fontWeight: '700'
              }}>
                {(c.nome || 'C').charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a' }}>
                  {c.nome}
                </div>
                <div style={{ fontSize: '12px', color: '#888', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ color: '#4338ca' }}>{c.cargo}</span>
                  {c.telefone && <span>· {c.telefone}</span>}
                  {!c.ativo && <span style={{ color: '#dc2626', fontWeight: '600' }}>· Inativo</span>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                <button onClick={() => toggleAtivo(c)} title={c.ativo ? 'Desativar' : 'Ativar'}
                  style={iconBtn}>
                  <Icon icon={c.ativo ? 'mdi:eye' : 'mdi:eye-off'} width="18" style={{ color: c.ativo ? '#16a34a' : '#aaa' }} />
                </button>
                <button onClick={() => abrirEditar(c)} title="Editar" style={iconBtn}>
                  <Icon icon="mdi:pencil" width="18" style={{ color: '#666' }} />
                </button>
                <button onClick={() => setConfirmDelete(c)} title="Excluir" style={iconBtn}>
                  <Icon icon="mdi:delete-outline" width="18" style={{ color: '#ef4444' }} />
                </button>
              </div>
            </div>
          ))}
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
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '420px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
                {modal.editando ? 'Editar colaborador' : 'Novo colaborador'}
              </h3>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <Icon icon="mdi:close" width="20" style={{ color: '#999' }} />
              </button>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Nome <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="text" value={nome} onChange={e => setNome(e.target.value)}
                placeholder="Ex: João da Silva"
                style={inputStyle} />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Telefone <span style={{ color: '#999', fontWeight: '400' }}>(opcional)</span></label>
              <input type="text" value={telefone} onChange={e => setTelefone(e.target.value)}
                placeholder="(11) 99999-9999"
                style={inputStyle} />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Cargo <span style={{ color: '#ef4444' }}>*</span></label>
              <select value={cargo} onChange={e => setCargo(e.target.value)} style={inputStyle}>
                {CARGOS_PADRAO.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="Outro">Outro...</option>
              </select>
            </div>

            {cargo === 'Outro' && (
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>Cargo personalizado</label>
                <input type="text" value={cargoOutro} onChange={e => setCargoOutro(e.target.value)}
                  placeholder="Ex: Personal Trainer"
                  style={inputStyle} />
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setModal(null)} style={{
                flex: 1, padding: '11px', backgroundColor: '#f3f4f6', color: '#555',
                border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600'
              }}>Cancelar</button>
              <button onClick={salvar} disabled={salvando}
                style={{
                  flex: 2, padding: '11px',
                  backgroundColor: salvando ? '#ccc' : '#344848', color: 'white',
                  border: 'none', borderRadius: '8px',
                  cursor: salvando ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '600'
                }}>
                {salvando ? 'Salvando...' : (modal.editando ? 'Salvar' : 'Adicionar')}
              </button>
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

const iconBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  padding: '6px', borderRadius: '6px', display: 'flex', alignItems: 'center'
}
const labelStyle = {
  display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '6px'
}
const inputStyle = {
  width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px',
  fontSize: '14px', boxSizing: 'border-box', backgroundColor: '#fff'
}
