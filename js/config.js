/* ==========================================================================
 * config.js — Constantes de negócio e parâmetros da aplicação
 *
 * Único sítio a editar quando o contrato for revisto ou quando se quiser
 * afinar limiares de aviso/validação.
 * ========================================================================== */
'use strict';

const CONFIG = Object.freeze({

  /**
   * Km contratualizados por Lote, do caderno de encargos.
   * Válidos para toda a duração da concessão (não mudam por ano) —
   * atualizar aqui apenas se o contrato for revisto.
   */
  LOTES_CADERNO_ENCARGOS: Object.freeze([
    { lote: 1, km: 2427444.11934 },
    { lote: 2, km: 2578392.204084 },
    { lote: 3, km: 1100763.1321129994 },
    { lote: 4, km: 2246586.2433850016 },
  ]),

  /**
   * Cobertura mínima do ano (%) para mostrar a % de execução do contrato
   * sem o toggle "anualizar" ativo. Evita comparar um período parcial
   * contra o km/ano contratado.
   */
  MIN_YEAR_COVERAGE_PCT: 90,

  /**
   * Nº de dias a partir do qual o período de um feed é assinalado a âmbar
   * (o feed pode ir além do mês pretendido).
   */
  SPAN_WARN_DAYS: 40,

  /**
   * Heurística de unidade no fallback via shape_dist_traveled:
   * se a mediana das distâncias por viagem exceder este valor,
   * assume-se que o feed está em metros (viagem típica = poucos km).
   */
  METERS_MEDIAN_THRESHOLD: 300,

  /** Dias de um ano de referência para anualização e cobertura. */
  DAYS_PER_YEAR: 365,
});
