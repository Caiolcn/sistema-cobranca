import { useState } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { showToast } from './Toast'
import whatsappService from './services/whatsappService'
import { parseISO, MESES } from './agendaUtils'

// ==========================================
// Modal de presença — compartilhado por todas as views da Agenda.
// Faz o upsert em `presencas`, ajusta créditos de pacote e notifica
// no WhatsApp. Reporta a mudança para o pai via onChange.
// ==========================================

export default function AgendaPresencaModal({
  userId, aula, devedorId, devedores, data,
  presencaExistente, credito, enviarNotifPresenca,
  onClose, onChange
}) {
  const [presente, setPresente] = useState(presencaExistente ? presencaExistente.presente : true)
  const [obs, setObs] = useState(presencaExistente ? (presencaExistente.observacao || '') : '')
  const [salvando, setSalvando] = useState(false)

  const dataObj = parseISO(data)
  const nome = devedores?.nome || 'Aluno'

  const salvar = async () => {
    setSalvando(true)
    let result
    if (presencaExistente) {
      result = await supabase.from('presencas')
        .update({ presente, observacao: obs.trim() || null, updated_at: new Date().toISOString() })
        .eq('id', presencaExistente.id).select()
    } else {
      result = await supabase.from('presencas').insert({
        user_id: userId, aula_id: aula.id, devedor_id: devedorId,
        data, presente, observacao: obs.trim() || null
      }).select()
    }

    if (result.error) {
      showToast('Erro ao salvar presença: ' + result.error.message, 'error')
      setSalvando(false)
      return
    }

    // Créditos de pacote (decrementa ao marcar presença, devolve ao virar falta)
    let novoCredito
    if (credito) {
      let nr = credito.aulas_restantes
      if (!presencaExistente && presente) nr = Math.max(credito.aulas_restantes - 1, 0)
      else if (presencaExistente && presencaExistente.presente && !presente) nr = credito.aulas_restantes + 1
      else if (presencaExistente && !presencaExistente.presente && presente) nr = Math.max(credito.aulas_restantes - 1, 0)

      if (nr !== credito.aulas_restantes) {
        await supabase.from('devedores').update({ aulas_restantes: nr }).eq('id', devedorId)
        novoCredito = nr
        if (nr === 0) showToast(`${nome} usou todas as aulas do pacote!`, 'warning')
        else if (nr <= 2) showToast(`${nome} tem ${nr} aula(s) restante(s)`, 'warning')
      }
    }

    showToast(presente ? 'Presença registrada!' : 'Falta registrada!', 'success')

    // Notificação WhatsApp (fire-and-forget)
    if (enviarNotifPresenca && devedores?.telefone) {
      try {
        const desc = aula.descricao ? ` - ${aula.descricao}` : ''
        const cred = credito ? { ...credito, aulas_restantes: novoCredito !== undefined ? novoCredito : credito.aulas_restantes } : null
        let msg
        if (presente) {
          if (cred) {
            const num = cred.aulas_total - cred.aulas_restantes
            msg = `✅ Presença confirmada, ${nome}!\n\n📚 Aula ${num} de ${cred.aulas_total}${desc}${obs.trim() ? `\n📝 ${obs.trim()}` : ''}\n\n📊 Restam ${cred.aulas_restantes} aula(s) no seu pacote.`
          } else {
            msg = `✅ Presença confirmada, ${nome}!${aula.descricao ? `\n📚 ${aula.descricao}` : ''}${obs.trim() ? `\n📝 ${obs.trim()}` : ''}`
          }
        } else {
          msg = `❌ Falta registrada, ${nome}.${aula.descricao ? `\n📚 ${aula.descricao}` : ''}${obs.trim() ? `\n📝 Motivo: ${obs.trim()}` : ''}`
          if (cred) msg += `\n\n📊 Você tem ${cred.aulas_restantes} aula(s) restante(s).`
        }
        await whatsappService.enviarMensagem(devedores.telefone, msg)
      } catch (e) { console.error('Erro notificação presença:', e) }
    }

    onChange({ presenca: result.data[0], novoCredito, removida: false })
    onClose()
  }

  const remover = async () => {
    if (!presencaExistente) return
    setSalvando(true)
    const { error } = await supabase.from('presencas').delete().eq('id', presencaExistente.id)
    if (error) {
      showToast('Erro ao remover presença: ' + error.message, 'error')
      setSalvando(false)
      return
    }
    // Devolve o crédito se a presença removida era "presente"
    let novoCredito
    if (presencaExistente.presente && credito) {
      novoCredito = credito.aulas_restantes + 1
      await supabase.from('devedores').update({ aulas_restantes: novoCredito }).eq('id', devedorId)
    }
    showToast('Presença removida!', 'success')
    onChange({ presenca: null, novoCredito, removida: true })
    onClose()
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10001,
        backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '20px'
      }}>
      <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '380px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Registrar Presença</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
            <Icon icon="mdi:close" width="20" style={{ color: '#999' }} />
          </button>
        </div>

        <div style={{ padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '10px', marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a' }}>{nome}</div>
          <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
            {aula.horario?.substring(0, 5)}{aula.descricao ? ` - ${aula.descricao}` : ''}
            {' · '}{dataObj.getDate()} de {MESES[dataObj.getMonth()]}
          </div>
          {credito && (
            <div style={{ fontSize: '11px', color: '#b45309', marginTop: '4px', fontWeight: '600' }}>
              {credito.aulas_restantes}/{credito.aulas_total} aulas restantes
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button onClick={() => setPresente(true)} style={{
            flex: 1, padding: '12px', borderRadius: '10px', cursor: 'pointer',
            backgroundColor: presente ? '#f0fdf4' : 'white',
            border: presente ? '2px solid #16a34a' : '1px solid #e5e7eb',
            fontSize: '14px', fontWeight: '600', color: presente ? '#16a34a' : '#666',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
          }}>
            <Icon icon="mdi:check-circle" width="20" /> Presente
          </button>
          <button onClick={() => setPresente(false)} style={{
            flex: 1, padding: '12px', borderRadius: '10px', cursor: 'pointer',
            backgroundColor: !presente ? '#fef2f2' : 'white',
            border: !presente ? '2px solid #dc2626' : '1px solid #e5e7eb',
            fontSize: '14px', fontWeight: '600', color: !presente ? '#dc2626' : '#666',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
          }}>
            <Icon icon="mdi:close-circle" width="20" /> Falta
          </button>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '6px' }}>
            {presente ? 'O que foi feito na aula?' : 'Motivo da falta'} <span style={{ color: '#999', fontWeight: '400' }}>(opcional)</span>
          </label>
          <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3}
            placeholder={presente ? 'Ex: Treino de peito e costas' : 'Ex: Aluno avisou que não poderia vir'}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' }} />
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {presencaExistente && (
            <button onClick={remover} disabled={salvando} title="Remover registro"
              style={{
                padding: '10px 12px', backgroundColor: '#fff', color: '#dc2626',
                border: '1px solid #fca5a5', borderRadius: '8px',
                cursor: salvando ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '600'
              }}>
              <Icon icon="mdi:delete-outline" width="18" />
            </button>
          )}
          <button onClick={onClose} style={{
            flex: 1, padding: '10px', backgroundColor: '#f3f4f6', color: '#555',
            border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600'
          }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando} style={{
            flex: 1, padding: '10px',
            backgroundColor: salvando ? '#ccc' : (presente ? '#16a34a' : '#ef4444'),
            color: 'white', border: 'none', borderRadius: '8px',
            cursor: salvando ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '600',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
          }}>
            <Icon icon={presente ? 'mdi:check' : 'mdi:close'} width="18" />
            {salvando ? 'Salvando...' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  )
}
