import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { SkeletonList } from './components/Skeleton'
import { useUser } from './contexts/UserContext'
import useWindowSize from './hooks/useWindowSize'
import { DIAS_LONGO, DIAS_CURTO, horaDe } from './agendaUtils'

// ==========================================
// Visualização read-only da tabela LEGADA `grade_horarios`.
// Mostra: total de registros, comparação com o modelo novo
// (aulas / aulas_fixos), e a grade em si (dia × horário × alunos).
// Não modifica nada — é só pra inspeção antes de decidir o que fazer
// com dados não migrados.
// ==========================================

const COR = '#344848'

export default function AgendaGradeLegada() {
  const { userId } = useUser()
  const { isMobile } = useWindowSize()

  const [grade, setGrade] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  const carregar = useCallback(async () => {
    if (!userId) return
    setLoading(true)

    const [gradeRes, statsRes] = await Promise.all([
      supabase.from('grade_horarios')
        .select('id, dia_semana, horario, descricao, ativo, devedor_id, devedores(nome, telefone, lixo)')
        .eq('user_id', userId)
        .order('dia_semana').order('horario'),
      // 3 contagens em paralelo: alunos na grade legada, aulas no modelo novo, fixos no modelo novo
      Promise.all([
        supabase.from('grade_horarios').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).not('devedor_id', 'is', null),
        supabase.from('aulas').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('aulas_fixos').select('id', { count: 'exact', head: true }).eq('user_id', userId)
      ])
    ])

    setGrade(gradeRes.data || [])
    setStats({
      alunosLegado: statsRes[0].count || 0,
      turmas:       statsRes[1].count || 0,
      fixos:        statsRes[2].count || 0
    })
    setLoading(false)
  }, [userId])

  useEffect(() => { carregar() }, [carregar])

  // Agrupar por dia da semana
  const porDia = useMemo(() => {
    const m = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }
    grade.forEach(g => { if (m[g.dia_semana]) m[g.dia_semana].push(g) })
    return m
  }, [grade])

  // Agrupar dentro de cada dia por horário+descricao
  const agruparHorarios = (registros) => {
    const m = {}
    registros.forEach(g => {
      const key = `${g.horario}|${g.descricao || ''}`
      if (!m[key]) m[key] = { horario: g.horario, descricao: g.descricao || '', alunos: [] }
      if (g.devedor_id && g.devedores) m[key].alunos.push({
        id: g.devedor_id, nome: g.devedores.nome, lixo: g.devedores.lixo, ativo: g.ativo
      })
    })
    return Object.values(m).sort((a, b) => (a.horario || '').localeCompare(b.horario || ''))
  }

  if (loading) return <div style={{ paddingTop: '12px' }}><SkeletonList count={5} /></div>

  const totalLinhas = grade.length
  if (totalLinhas === 0) {
    return (
      <div style={{
        border: '1px solid #eee', borderRadius: '12px',
        padding: '32px 18px', textAlign: 'center', color: '#999'
      }}>
        <Icon icon="mdi:archive-outline" width="42" style={{ color: '#ddd' }} />
        <p style={{ fontSize: '14px', fontWeight: '500', color: '#666', margin: '10px 0 2px' }}>
          Sem registros na grade antiga
        </p>
        <p style={{ fontSize: '13px', margin: 0 }}>
          Os dados de <code>grade_horarios</code> estão vazios — não há nada pra migrar.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Banner explicativo */}
      <div style={{
        backgroundColor: '#fef3c7', border: '1px solid #fde68a', borderRadius: '10px',
        padding: '12px 14px', marginBottom: '16px',
        display: 'flex', alignItems: 'flex-start', gap: '10px'
      }}>
        <Icon icon="mdi:archive-outline" width="22" style={{ color: '#b45309', flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '13px', color: '#92400e' }}>
          <strong>Visualização do modelo legado (`grade_horarios`)</strong> — esta tela é
          somente leitura. Use pra comparar com a Agenda nova e decidir se há dados pra remigrar.
        </div>
      </div>

      {/* Stats de comparação */}
      <div style={{
        display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
        gap: '10px', marginBottom: '18px'
      }}>
        <CardStat
          icon="mdi:archive-outline" cor="#b45309" bg="#fffbeb"
          valor={stats?.alunosLegado || 0}
          label="Alunos na grade antiga"
          hint="Registros em grade_horarios com devedor_id"
        />
        <CardStat
          icon="mdi:calendar-clock" cor="#4338ca" bg="#eef2ff"
          valor={stats?.turmas || 0}
          label="Turmas no modelo novo"
          hint="Linhas em aulas"
        />
        <CardStat
          icon="mdi:account-multiple" cor="#16a34a" bg="#f0fdf4"
          valor={stats?.fixos || 0}
          label="Alunos fixos no modelo novo"
          hint="Linhas em aulas_fixos"
        />
      </div>

      {/* Aviso se há discrepância */}
      {stats && stats.alunosLegado > stats.fixos && (
        <div style={{
          backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px',
          padding: '10px 14px', marginBottom: '16px',
          fontSize: '13px', color: '#9a3412',
          display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          <Icon icon="mdi:alert-circle-outline" width="18" style={{ color: '#ea580c' }} />
          A grade antiga tem <strong>{stats.alunosLegado - stats.fixos}</strong> aluno(s) a
          mais que os fixos do modelo novo. Pode ser que a migração não tenha completado.
        </div>
      )}

      {/* Grade por dia */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {[1, 2, 3, 4, 5, 6, 0].map(dia => {
          const horarios = agruparHorarios(porDia[dia])
          if (horarios.length === 0) return null
          return (
            <div key={dia} style={{ border: '1px solid #eee', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{
                padding: '10px 14px', backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0',
                fontSize: '14px', fontWeight: '600', color: COR,
                display: 'flex', alignItems: 'center', gap: '8px'
              }}>
                <Icon icon="mdi:calendar-blank-outline" width="16" />
                {isMobile ? DIAS_CURTO[dia] : DIAS_LONGO[dia]}
                <span style={{ fontSize: '11px', fontWeight: '500', color: '#888', marginLeft: 'auto' }}>
                  {horarios.length} horário{horarios.length > 1 ? 's' : ''}
                </span>
              </div>
              {horarios.map(h => (
                <div key={h.horario + h.descricao} style={{
                  padding: '10px 14px', borderTop: '1px solid #f5f5f5',
                  display: 'flex', alignItems: 'flex-start', gap: '12px'
                }}>
                  <div style={{
                    minWidth: '60px', fontSize: '13px', fontWeight: '700', color: '#4338ca'
                  }}>
                    {(h.horario || '').substring(0, 5)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {h.descricao && (
                      <div style={{ fontSize: '13px', color: '#1a1a1a', marginBottom: '4px' }}>
                        {h.descricao}
                      </div>
                    )}
                    {h.alunos.length === 0 ? (
                      <div style={{ fontSize: '12px', color: '#aaa' }}>— sem alunos neste horário</div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {h.alunos.map((a, i) => (
                          <div key={a.id + '_' + i} title={a.lixo ? 'Aluno marcado como excluído' : ''}
                            style={{
                              padding: '3px 9px', borderRadius: '12px',
                              fontSize: '12px', fontWeight: '500',
                              backgroundColor: a.lixo ? '#fef2f2' : (a.ativo === false ? '#f3f4f6' : '#eef2ff'),
                              color: a.lixo ? '#b91c1c' : (a.ativo === false ? '#888' : '#3730a3'),
                              border: `1px solid ${a.lixo ? '#fecaca' : (a.ativo === false ? '#e5e7eb' : '#c7d2fe')}`,
                              textDecoration: a.lixo ? 'line-through' : 'none'
                            }}>
                            {a.nome || 'Sem nome'}
                            {a.lixo && ' (lixo)'}
                            {!a.lixo && a.ativo === false && ' (inativo)'}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <p style={{ marginTop: '14px', fontSize: '11px', color: '#999', textAlign: 'center' }}>
        Total de {totalLinhas} registros em <code>grade_horarios</code> (modelo legado).
      </p>
    </div>
  )
}

function CardStat({ icon, cor, bg, valor, label, hint }) {
  return (
    <div style={{
      backgroundColor: bg, borderRadius: '10px', padding: '14px',
      display: 'flex', alignItems: 'center', gap: '12px'
    }}>
      <Icon icon={icon} width="26" style={{ color: cor, flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '22px', fontWeight: '700', color: cor, lineHeight: 1 }}>{valor}</div>
        <div style={{ fontSize: '12px', color: '#444', marginTop: '2px', fontWeight: '600' }}>{label}</div>
        <div style={{ fontSize: '10px', color: '#888' }}>{hint}</div>
      </div>
    </div>
  )
}
