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
              <Icon icon="material-symbols:info-outline" width="20" />
              <span>Filtros por Período Mensal</span>
            </div>
            <p className="drp-info-text">
              Os dados do dashboard são calculados com base em períodos mensais completos.
              Selecione uma opção ao lado para visualizar as métricas do período desejado.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default DateRangePicker;
