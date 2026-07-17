/* ==========================================================================
 * utils.js — Funções utilitárias genéricas (datas, formatação, HTML)
 *
 * Sem dependências. Não toca no DOM.
 * ========================================================================== */
'use strict';

const Utils = Object.freeze({

  /**
   * Converte data GTFS "yyyymmdd" para ISO "YYYY-MM-DD".
   * Devolve a string original se não tiver 8 caracteres.
   * @param {string|number} yyyymmdd
   * @returns {string}
   */
  toDateStr(yyyymmdd){
    const s = String(yyyymmdd).trim();
    if(s.length !== 8) return s;
    return s.slice(0,4) + '-' + s.slice(4,6) + '-' + s.slice(6,8);
  },

  /**
   * Converte data ISO "YYYY-MM-DD" para formato GTFS "yyyymmdd".
   * @param {string} dateStr
   * @returns {string}
   */
  toGtfsDate(dateStr){
    return dateStr.replaceAll('-','');
  },

  /**
   * Nº de dias entre duas datas ISO, inclusive em ambas as pontas.
   * @param {string} startStr - "YYYY-MM-DD"
   * @param {string} endStr   - "YYYY-MM-DD"
   * @returns {number}
   */
  daysBetween(startStr, endStr){
    const a = new Date(startStr + 'T00:00:00');
    const b = new Date(endStr + 'T00:00:00');
    return Math.round((b - a) / 86400000) + 1;
  },

  /**
   * Lista de objetos Date para cada dia do intervalo [start, end].
   * @param {string} startStr - "YYYY-MM-DD"
   * @param {string} endStr   - "YYYY-MM-DD"
   * @returns {Date[]}
   */
  dateRangeDays(startStr, endStr){
    const days = [];
    let d = new Date(startStr + 'T00:00:00');
    const end = new Date(endStr + 'T00:00:00');
    while(d <= end){
      days.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return days;
  },

  /**
   * Formata km para apresentação em pt-PT, sempre com 2 casas decimais.
   * @param {number} n
   * @returns {string}
   */
  fmtKm(n){
    return n.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  /**
   * Escapa caracteres HTML para inserção segura via innerHTML.
   * @param {string} s
   * @returns {string}
   */
  escapeHtml(s){
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  },
});
