import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '@iconify/react';
import './DateRangePicker.css';

function DateRangePicker({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [hoverDate, setHoverDate] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const pickerRef = useRef(null);

  const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const diasSemana = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

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

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    // Ajustar primeiro dia da semana (0 = domingo, precisamos que 0 = segunda)
    let firstDayOfWeek = firstDay.getDay() - 1;
    if (firstDayOfWeek === -1) firstDayOfWeek = 6;

    const days = [];

    // Espaços vazios antes do primeiro dia
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push({
        day: null,
        isCurrentMonth: false,
        date: null
      });
    }

    // Dias do mês atual
    for (let day = 1; day <= daysInMonth; day++) {
      days.push({
        day,
        isCurrentMonth: true,
        date: new Date(year, month, day)
      });
    }

    return days;
  };

  const isDateInRange = (date) => {
    if (!startDate || !endDate) return false;
    return date >= startDate && date <= endDate;
  };

  const isDateHoverRange = (date) => {
    if (!startDate || !hoverDate || endDate) return false;
    const min = startDate < hoverDate ? startDate : hoverDate;
    const max = startDate > hoverDate ? startDate : hoverDate;
    return date >= min && date <= max;
  };

  const isDateSelected = (date) => {
    if (!startDate && !endDate) return false;
    return (
      (startDate && date.toDateString() === startDate.toDateString()) ||
      (endDate && date.toDateString() === endDate.toDateString())
    );
  };

  const handleDayClick = (dateObj) => {
    if (!startDate || endDate) {
      setStartDate(dateObj.date);
      setEndDate(null);
    } else {
      if (dateObj.date < startDate) {
        setEndDate(startDate);
        setStartDate(dateObj.date);
      } else {
        setEndDate(dateObj.date);
      }
    }
  };

  const handleQuickSelect = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days + 1);
    setStartDate(start);
    setEndDate(end);
  };

  const handleMonthChange = (direction) => {
    const newDate = new Date(currentMonth);
    newDate.setMonth(newDate.getMonth() + direction);
    setCurrentMonth(newDate);
  };

  const handleApply = () => {
    if (startDate && endDate) {
      onChange({
        inicio: startDate.toISOString().split('T')[0],
        fim: endDate.toISOString().split('T')[0]
      });
      setIsOpen(false);
    }
  };

  const getDisplayText = () => {
    if (value === 'hoje') return 'Hoje';
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
    if (value === 'ultimos_7_dias') return 'Últimos 7 Dias';
    if (value === 'ultimos_30_dias') return 'Últimos 30 Dias';
    if (value === 'ultimos_60_dias') return 'Últimos 60 Dias';
    if (value === 'ultimos_90_dias') return 'Últimos 90 Dias';

    if (value && value.inicio && value.fim) {
      const inicio = new Date(value.inicio + 'T00:00:00');
      const fim = new Date(value.fim + 'T00:00:00');
      return `${inicio.getDate()}/${inicio.getMonth() + 1}/${inicio.getFullYear()} - ${fim.getDate()}/${fim.getMonth() + 1}/${fim.getFullYear()}`;
    }

    const hoje = new Date();
    return `${meses[hoje.getMonth()]} ${hoje.getFullYear()}`;
  };

  const renderMonth = (monthOffset = 0) => {
    const date = new Date(currentMonth);
    date.setMonth(date.getMonth() + monthOffset);
    const days = getDaysInMonth(date);

    return (
      <div className="drp-calendar">
        <div className="drp-month-header">
          {monthOffset === 0 && (
            <button className="drp-nav-btn" onClick={() => handleMonthChange(-1)}>
              <Icon icon="material-symbols:chevron-left" width="20" />
            </button>
          )}
          <span className="drp-month-title">
            {meses[date.getMonth()]} {date.getFullYear()}
          </span>
          {monthOffset === 1 && (
            <button className="drp-nav-btn" onClick={() => handleMonthChange(1)}>
              <Icon icon="material-symbols:chevron-right" width="20" />
            </button>
          )}
        </div>

        <div className="drp-weekdays">
          {diasSemana.map((dia) => (
            <div key={dia} className="drp-weekday">{dia}</div>
          ))}
        </div>

        <div className="drp-days">
          {days.map((dateObj, index) => {
            if (!dateObj.day) {
              return <div key={index} className="drp-day-empty"></div>;
            }

            const isInRange = isDateInRange(dateObj.date);
            const isHoverRange = isDateHoverRange(dateObj.date);
            const isSelected = isDateSelected(dateObj.date);
            const isToday = dateObj.date.toDateString() === new Date().toDateString();

            return (
              <button
                key={index}
                className={`drp-day
                  ${isSelected ? 'drp-day-selected' : ''}
                  ${isInRange ? 'drp-day-in-range' : ''}
                  ${isHoverRange ? 'drp-day-hover-range' : ''}
                  ${isToday ? 'drp-day-today' : ''}
                `}
                onClick={() => handleDayClick(dateObj)}
                onMouseEnter={() => setHoverDate(dateObj.date)}
              >
                {dateObj.day}
              </button>
            );
          })}
        </div>
      </div>
    );
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
              className={`drp-quick-btn ${value === 'hoje' ? 'active' : ''}`}
              onClick={() => { onChange('hoje'); setIsOpen(false); }}
            >
              Hoje
            </button>
            <button
              className={`drp-quick-btn ${value === 'ultimos_7_dias' ? 'active' : ''}`}
              onClick={() => { onChange('ultimos_7_dias'); setIsOpen(false); }}
            >
              Últimos 7 Dias
            </button>
            <button
              className={`drp-quick-btn ${value === 'ultimos_30_dias' ? 'active' : ''}`}
              onClick={() => { onChange('ultimos_30_dias'); setIsOpen(false); }}
            >
              Últimos 30 Dias
            </button>
            <button
              className={`drp-quick-btn ${value === 'ultimos_60_dias' ? 'active' : ''}`}
              onClick={() => { onChange('ultimos_60_dias'); setIsOpen(false); }}
            >
              Últimos 60 Dias
            </button>
          </div>

          <div className="drp-calendars">
            {renderMonth(0)}
            {renderMonth(1)}
          </div>

          {startDate && endDate && (
            <div className="drp-footer">
              <button className="drp-btn-cancel" onClick={() => setIsOpen(false)}>
                Cancelar
              </button>
              <button className="drp-btn-apply" onClick={handleApply}>
                Aplicar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DateRangePicker;
