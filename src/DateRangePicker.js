import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '@iconify/react';
import './DateRangePicker.css';

function DateRangePicker({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef(null);

  const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const mesesAbrev = [
    'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
  ];

  const hoje = new Date();
  // Valor de mês específico tem o formato "mes:AAAA-MM"
  const mesEspecifico = typeof value === 'string' && value.startsWith('mes:') ? value.slice(4) : null;
  const [anoView, setAnoView] = useState(() =>
    mesEspecifico ? parseInt(mesEspecifico.split('-')[0], 10) : hoje.getFullYear()
  );

  // Fechar ao clicar fora
  useEffect(() => {
    function handleClickOutside(event) {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);


  const getDisplayText = () => {
    if (value === 'mes_atual') {
      const hoje = new Date();
      return `${meses[hoje.getMonth()]} ${hoje.getFullYear()}`;
    }
    if (value === 'mes_anterior') {
      const hoje = new Date();
      const mesAnterior = hoje.getMonth() === 0 ? 11 : hoje.getMonth() - 1;
      const ano = hoje.getMonth() === 0 ? hoje.getFullYear() - 1 : hoje.getFullYear();
      return `${meses[mesAnterior]} ${ano}`;
    }
    if (value === 'ultimos_3_meses') {
      const hoje = new Date();
      const tresMesesAtras = new Date();
      tresMesesAtras.setMonth(hoje.getMonth() - 2);
      return `Últimos 3 Meses`;
    }
    if (value === 'ultimos_6_meses') {
      return `Últimos 6 Meses`;
    }
    if (value === 'este_ano') {
      const hoje = new Date();
      return `${hoje.getFullYear()}`;
    }
    if (mesEspecifico) {
      const [ano, mes] = mesEspecifico.split('-').map(Number);
      return `${meses[mes - 1]} ${ano}`;
    }

    // Default: mês atual
    const hoje = new Date();
    return `${meses[hoje.getMonth()]} ${hoje.getFullYear()}`;
  };


  return (
    <div className="date-range-picker" ref={pickerRef}>
      <button
        className="drp-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Icon icon="material-symbols:calendar-month-outline" width="20" />
        <span>{getDisplayText()}</span>
        <Icon icon="material-symbols:expand-more" width="20" />
      </button>

      {isOpen && (
        <div className="drp-dropdown">
          <div className="drp-sidebar">
            <button
              className={`drp-quick-btn ${value === 'mes_atual' ? 'active' : ''}`}
              onClick={() => { onChange('mes_atual'); setIsOpen(false); }}
            >
              Mês Atual
            </button>
            <button
              className={`drp-quick-btn ${value === 'mes_anterior' ? 'active' : ''}`}
              onClick={() => { onChange('mes_anterior'); setIsOpen(false); }}
            >
              Mês Anterior
            </button>
            <button
              className={`drp-quick-btn ${value === 'ultimos_3_meses' ? 'active' : ''}`}
              onClick={() => { onChange('ultimos_3_meses'); setIsOpen(false); }}
            >
              Últimos 3 Meses
            </button>
            <button
              className={`drp-quick-btn ${value === 'ultimos_6_meses' ? 'active' : ''}`}
              onClick={() => { onChange('ultimos_6_meses'); setIsOpen(false); }}
            >
              Últimos 6 Meses
            </button>
            <button
              className={`drp-quick-btn ${value === 'este_ano' ? 'active' : ''}`}
              onClick={() => { onChange('este_ano'); setIsOpen(false); }}
            >
              Este Ano
            </button>
          </div>

          <div className="drp-info-panel">
            <div className="drp-info-header">
              <Icon icon="material-symbols:calendar-month-outline" width="20" />
              <span>Mês específico</span>
            </div>

            <div className="drp-year-nav">
              <button
                className="drp-nav-btn"
                onClick={() => setAnoView(anoView - 1)}
                aria-label="Ano anterior"
              >
                <Icon icon="material-symbols:chevron-left" width="22" />
              </button>
              <span className="drp-year-title">{anoView}</span>
              <button
                className="drp-nav-btn"
                onClick={() => setAnoView(anoView + 1)}
                disabled={anoView >= hoje.getFullYear()}
                aria-label="Próximo ano"
              >
                <Icon icon="material-symbols:chevron-right" width="22" />
              </button>
            </div>

            <div className="drp-months-grid">
              {mesesAbrev.map((m, idx) => {
                const mm = String(idx + 1).padStart(2, '0');
                const val = `mes:${anoView}-${mm}`;
                const isFuture =
                  anoView > hoje.getFullYear() ||
                  (anoView === hoje.getFullYear() && idx > hoje.getMonth());
                const isActive = value === val;
                return (
                  <button
                    key={m}
                    className={`drp-month-btn ${isActive ? 'active' : ''}`}
                    disabled={isFuture}
                    onClick={() => { onChange(val); setIsOpen(false); }}
                  >
                    {m}
                  </button>
                );
              })}
            </div>

            <p className="drp-info-text">
              Selecione um mês para ver apenas os dados desse período.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default DateRangePicker;
