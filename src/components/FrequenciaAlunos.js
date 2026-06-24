import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { exportToCSV } from '../utils/exportUtils';
import Table from '../design-system/components/Table';
import Select from '../design-system/components/Select';
import SearchInput from '../design-system/components/SearchInput';
import Button from '../design-system/components/Button';
import Badge from '../design-system/components/Badge';

// ==========================================
// FrequenciaAlunos — tabela de frequência por aluno na página de Relatórios.
// Agrega a tabela `presencas` (que guarda presença E falta na mesma linha,
// presente=true/false) no período selecionado: por aluno mostra
// Aulas previstas (= total marcado), Presenças, Faltas e % de frequência.
//
// Cada presença carrega o aula_id → modalidade da turma, então dá pra
// filtrar a frequência por modalidade sem ambiguidade (um aluno em 2
// modalidades aparece com os números certos de cada uma).
// Layout 100% no design system (Table, Select, SearchInput, Button, Badge).
// ==========================================

const SEM_MOD = '__sem__'; // sentinela p/ presenças de turma sem modalidade

// Normaliza telefone p/ wa.me: só dígitos, com DDI 55 se ainda não tiver
const linkWhatsapp = (tel) => {
  const d = (tel || '').replace(/\D/g, '');
  if (!d) return null;
  const full = d.startsWith('55') ? d : `55${d}`;
  return `https://wa.me/${full}`;
};

export default function FrequenciaAlunos({ userId, inicio, fim }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [registros, setRegistros] = useState([]); // 1 item por presença (com modalidade)
  const [busca, setBusca] = useState('');
  const [modFiltro, setModFiltro] = useState('todas'); // 'todas' | id | SEM_MOD

  const carregar = useCallback(async () => {
    if (!userId || !inicio || !fim) return;
    setLoading(true);
    // presenças → aluno (nome/telefone) e → aula → modalidade.
    // !inner em devedores aplica o filtro de lixo; modalidade vem por left join
    // (turma sem modalidade traz null).
    const { data, error } = await supabase
      .from('presencas')
      .select('devedor_id, presente, devedores!inner(nome, telefone, lixo), aulas(modalidade_id, modalidades(id, nome, cor))')
      .eq('user_id', userId)
      .gte('data', inicio)
      .lte('data', fim)
      .not('devedor_id', 'is', null)
      .or('lixo.is.null,lixo.eq.false', { referencedTable: 'devedores' });

    if (error) {
      console.error('Erro ao carregar frequência:', error);
      setRegistros([]);
      setLoading(false);
      return;
    }

    setRegistros((data || []).map(p => {
      const mod = p.aulas?.modalidades || null;
      return {
        devedorId: p.devedor_id,
        nome: p.devedores?.nome || 'Aluno',
        telefone: p.devedores?.telefone || '',
        presente: !!p.presente,
        modId: mod?.id || SEM_MOD,
        modNome: mod?.nome || null,
        modCor: mod?.cor || '#94a3b8'
      };
    }));
    setLoading(false);
  }, [userId, inicio, fim]);

  useEffect(() => { carregar(); }, [carregar]);

  // Opções do Select de modalidade (a partir dos dados do período)
  const modOptions = useMemo(() => {
    const map = new Map();
    let temSemMod = false;
    registros.forEach(r => {
      if (r.modId === SEM_MOD) temSemMod = true;
      else if (!map.has(r.modId)) map.set(r.modId, r.modNome);
    });
    const opts = [{ value: 'todas', label: 'Todas as modalidades' }];
    [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
      .forEach(([id, nome]) => opts.push({ value: id, label: nome }));
    if (temSemMod) opts.push({ value: SEM_MOD, label: 'Sem modalidade' });
    return opts;
  }, [registros]);

  // Agrega por aluno, respeitando o filtro de modalidade
  const linhas = useMemo(() => {
    const porAluno = {};
    registros.forEach(r => {
      if (modFiltro !== 'todas' && r.modId !== modFiltro) return;
      if (!porAluno[r.devedorId]) {
        porAluno[r.devedorId] = {
          id: r.devedorId, nome: r.nome, telefone: r.telefone,
          previstas: 0, presencas: 0, faltas: 0, mods: new Map()
        };
      }
      const a = porAluno[r.devedorId];
      a.previstas++;
      if (r.presente) a.presencas++; else a.faltas++;
      if (r.modNome) a.mods.set(r.modId, { nome: r.modNome, cor: r.modCor });
    });
    return Object.values(porAluno)
      .map(a => ({ ...a, modList: [...a.mods.values()], pct: a.previstas > 0 ? Math.round((a.presencas / a.previstas) * 100) : 0 }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [registros, modFiltro]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return linhas;
    return linhas.filter(l => l.nome.toLowerCase().includes(t));
  }, [linhas, busca]);

  const totais = useMemo(() => filtradas.reduce((acc, l) => ({
    previstas: acc.previstas + l.previstas,
    presencas: acc.presencas + l.presencas,
    faltas: acc.faltas + l.faltas
  }), { previstas: 0, presencas: 0, faltas: 0 }), [filtradas]);
  const pctTotal = totais.previstas > 0 ? Math.round((totais.presencas / totais.previstas) * 100) : 0;

  const freqVariant = (v) => v >= 75 ? 'success' : v >= 50 ? 'warning' : 'danger';

  const exportar = () => {
    exportToCSV(filtradas.map(l => ({
      Aluno: l.nome,
      Telefone: l.telefone || '',
      Modalidades: l.modList.map(m => m.nome).join(', '),
      Aulas: l.previstas,
      Presencas: l.presencas,
      Faltas: l.faltas,
      'Frequencia (%)': l.pct
    })), 'frequencia_alunos');
  };

  const columns = useMemo(() => [
    {
      key: 'nome', label: 'Aluno',
      render: (l) => <span style={{ fontWeight: 600, color: 'var(--color-text-primary, #1E293B)' }}>{l.nome}</span>
    },
    {
      key: 'modalidade', label: 'Modalidade',
      render: (l) => l.modList.length === 0
        ? <span style={{ color: 'var(--neutral-300, #CBD5E1)' }}>—</span>
        : (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {l.modList.map(m => (
              <Badge key={m.nome} dot customColor={m.cor + '1f'} customTextColor={m.cor}>{m.nome}</Badge>
            ))}
          </div>
        )
    },
    { key: 'previstas', label: 'Aulas', align: 'center' },
    {
      key: 'presencas', label: 'Presenças', align: 'center',
      render: (l) => <span style={{ color: 'var(--success-700, #16a34a)', fontWeight: 600 }}>{l.presencas}</span>
    },
    {
      key: 'faltas', label: 'Faltas', align: 'center',
      render: (l) => <span style={{ color: l.faltas > 0 ? 'var(--danger-600, #dc2626)' : 'var(--neutral-400, #94a3b8)', fontWeight: 600 }}>{l.faltas}</span>
    },
    {
      key: 'pct', label: 'Frequência', align: 'center',
      render: (l) => <Badge variant={freqVariant(l.pct)}>{l.pct}%</Badge>
    },
    {
      key: 'acoes', label: 'Ações', align: 'center',
      render: (l) => {
        const wa = linkWhatsapp(l.telefone);
        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }} data-no-row-click>
            <Button
              as={wa ? 'a' : 'button'}
              href={wa || undefined}
              target={wa ? '_blank' : undefined}
              rel={wa ? 'noopener noreferrer' : undefined}
              variant="whatsapp" size="sm" iconOnly icon="mdi:whatsapp"
              disabled={!wa}
              aria-label="Abrir conversa no WhatsApp"
              title={wa ? 'Abrir conversa no WhatsApp' : 'Sem telefone cadastrado'}
            />
            <Button
              variant="gray" size="sm" iconOnly icon="mdi:account-details-outline"
              onClick={() => navigate(`/app/clientes?abrir=${l.id}`)}
              aria-label="Abrir ficha do aluno"
              title="Abrir ficha do aluno"
            />
          </div>
        );
      }
    }
  ], [navigate]);

  const semFiltro = !busca && modFiltro === 'todas';

  return (
    <div className="home-section" style={{ marginBottom: '24px' }}>
      <div className="section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ margin: 0 }}>Frequência dos Alunos</h2>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {modOptions.length > 1 && (
            <div style={{ minWidth: '210px' }}>
              <Select
                portal
                options={modOptions}
                value={modFiltro}
                onChange={(v) => setModFiltro(v || 'todas')}
                placeholder="Todas as modalidades"
                aria-label="Filtrar por modalidade"
              />
            </div>
          )}
          <div style={{ minWidth: '200px' }}>
            <SearchInput
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar aluno..."
            />
          </div>
          <Button
            variant="outline" icon="ph:export-light"
            onClick={exportar}
            disabled={filtradas.length === 0}
          >
            Exportar
          </Button>
        </div>
      </div>

      <Table
        columns={columns}
        data={filtradas}
        rowKey="id"
        loading={loading}
        hoverable={false}
        emptyIcon="mdi:calendar-check-outline"
        emptyTitle={semFiltro ? 'Nenhuma presença registrada no período' : 'Nenhum aluno encontrado'}
        emptyMessage={semFiltro
          ? 'Marque presenças/faltas na Agenda para ver a frequência aqui.'
          : 'Ajuste a busca ou o filtro de modalidade.'}
      />

      {!loading && filtradas.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '16px',
          marginTop: '12px', padding: '12px 16px',
          backgroundColor: 'var(--neutral-50, #F8FAFC)', borderRadius: 'var(--radius-lg, 8px)',
          fontSize: '13px', color: 'var(--color-text-secondary, #475569)'
        }}>
          <strong style={{ color: 'var(--color-text-primary, #1E293B)' }}>
            Total · {filtradas.length} aluno{filtradas.length !== 1 ? 's' : ''}
          </strong>
          <span>{totais.previstas} aulas</span>
          <span style={{ color: 'var(--success-700, #16a34a)', fontWeight: 600 }}>{totais.presencas} presenças</span>
          <span style={{ color: 'var(--danger-600, #dc2626)', fontWeight: 600 }}>{totais.faltas} faltas</span>
          <Badge variant={freqVariant(pctTotal)}>{pctTotal}% de frequência</Badge>
        </div>
      )}
    </div>
  );
}
