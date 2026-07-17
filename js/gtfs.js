/* ==========================================================================
 * gtfs.js — Leitura e processamento de feeds GTFS
 *
 * Responsável por:
 *   - ler ficheiros CSV de dentro do ZIP (JSZip + PapaParse)
 *   - detetar o intervalo de datas do feed
 *   - calcular km de serviço por linha para um período
 *
 * Depende de: Utils (utils.js), Geo (geo.js), CONFIG (config.js)
 * e das bibliotecas globais JSZip e Papa (carregadas por CDN).
 * Não toca no DOM.
 * ========================================================================== */
'use strict';

const GTFS = Object.freeze({

  /** Nomes dos dias da semana no calendar.txt, indexados por Date.getDay(). */
  DOW: Object.freeze(['sunday','monday','tuesday','wednesday','thursday','friday','saturday']),

  /**
   * Lê um ficheiro CSV de dentro do ZIP (procura em qualquer subpasta,
   * sem distinguir maiúsculas/minúsculas).
   * @param {JSZip} zip
   * @param {string} name - ex.: "trips.txt"
   * @returns {Promise<Object[]|null>} linhas como objetos, ou null se não existir
   */
  async readCsv(zip, name){
    const fileObj = zip.file(new RegExp('(^|/)' + name + '$', 'i'))[0];
    if(!fileObj) return null;
    const text = await fileObj.async('string');
    const parsed = Papa.parse(text, { header:true, skipEmptyLines:true, dynamicTyping:false });
    return parsed.data;
  },

  /**
   * Deteta o intervalo de datas do feed: tenta feed_info.txt primeiro,
   * depois calendar.txt + calendar_dates.txt.
   * @param {JSZip} zip
   * @returns {Promise<{start:string, end:string, min:string, max:string}>} datas ISO
   */
  async detectDateRange(zip){
    // 1) feed_info.txt, se declarar o período
    const feedInfo = await this.readCsv(zip, 'feed_info.txt');
    if(feedInfo && feedInfo[0] && feedInfo[0].feed_start_date && feedInfo[0].feed_end_date){
      const s = feedInfo[0].feed_start_date, e = feedInfo[0].feed_end_date;
      return { start: Utils.toDateStr(s), end: Utils.toDateStr(e), min: Utils.toDateStr(s), max: Utils.toDateStr(e) };
    }

    // 2) calendar.txt + calendar_dates.txt
    const cal = await this.readCsv(zip, 'calendar.txt');
    let min = null, max = null;
    if(cal){
      for(const row of cal){
        if(row.start_date && (!min || row.start_date < min)) min = row.start_date;
        if(row.end_date && (!max || row.end_date > max)) max = row.end_date;
      }
    }
    const calDates = await this.readCsv(zip, 'calendar_dates.txt');
    if(calDates){
      for(const row of calDates){
        if(row.date){
          if(!min || row.date < min) min = row.date;
          if(!max || row.date > max) max = row.date;
        }
      }
    }
    if(!min || !max){ min = '20260101'; max = '20261231'; }
    return { start: Utils.toDateStr(min), end: Utils.toDateStr(max), min: Utils.toDateStr(min), max: Utils.toDateStr(max) };
  },

  /**
   * Processa um feed GTFS e calcula os km de serviço no período definido.
   *
   * Fonte primária de distância: shapes.txt, somada com a geodésica
   * elipsoidal WGS84 (Vincenty) — aproxima muito melhor os totais
   * oficiais/esperados do que uma soma Haversine esférica ou os valores
   * de shape_dist_traveled do próprio feed (que na prática tendem a
   * exceder, ex.: incluir troços de garagem/recolha, ou usar um método
   * de medição ligeiramente diferente do trajeto geodésico).
   *
   * Fallback: apenas para viagens sem shape utilizável, usa o máximo de
   * shape_dist_traveled em stop_times.txt (unidades nativas do feed, com
   * heurística de deteção metros/km).
   *
   * @param {{zip:JSZip, startDate:string, endDate:string}} entry
   * @returns {Promise<{byRoute:Object, routeName:Object, totalKm:number, days:number,
   *                    unit:string, fallbackUsed:number, noDistCount:number,
   *                    hasFrequencies:boolean}>}
   */
  async processFile(entry){
    const zip = entry.zip;
    const [trips, stopTimes, calendar, calendarDates, shapes, routes] = await Promise.all([
      this.readCsv(zip, 'trips.txt'),
      this.readCsv(zip, 'stop_times.txt'),
      this.readCsv(zip, 'calendar.txt'),
      this.readCsv(zip, 'calendar_dates.txt'),
      this.readCsv(zip, 'shapes.txt'),
      this.readCsv(zip, 'routes.txt'),
    ]);

    if(!trips || !stopTimes) throw new Error('faltam trips.txt ou stop_times.txt');

    // Nome das linhas (route_id -> nome)
    const routeName = {};
    if(routes){
      for(const r of routes){
        routeName[r.route_id] = r.route_short_name || r.route_long_name || r.route_id;
      }
    }

    // trip -> route/service
    const tripInfo = {};
    for(const t of trips){
      tripInfo[t.trip_id] = { route_id: t.route_id, service_id: t.service_id };
    }

    // Comprimento de cada shape via Vincenty
    const tripShape = {};
    for(const t of trips) tripShape[t.trip_id] = t.shape_id;

    const shapeLen = {}; // shape_id -> km
    if(shapes){
      const byShape = {};
      for(const s of shapes){
        const sid = s.shape_id;
        if(!byShape[sid]) byShape[sid] = [];
        byShape[sid].push({ seq: parseInt(s.shape_pt_sequence), lat: parseFloat(s.shape_pt_lat), lon: parseFloat(s.shape_pt_lon) });
      }
      for(const sid in byShape){
        const pts = byShape[sid].sort((a,b)=>a.seq-b.seq);
        let len = 0;
        for(let i=1;i<pts.length;i++) len += Geo.vincenty(pts[i-1], pts[i]);
        shapeLen[sid] = len; // km
      }
    }

    // Distância por viagem: shape (primário) ou fallback
    const tripDistKm = {};
    const tripsNeedingFallback = new Set();
    for(const tid in tripInfo){
      const sid = tripShape[tid];
      if(sid && shapeLen[sid] != null){
        tripDistKm[tid] = shapeLen[sid];
      } else {
        tripsNeedingFallback.add(tid);
      }
    }

    // Fallback: shape_dist_traveled em stop_times.txt (unidades nativas)
    let fallbackUsed = 0;
    if(tripsNeedingFallback.size > 0 && stopTimes){
      const tripDistRaw = {};
      for(const st of stopTimes){
        const tid = st.trip_id;
        if(!tripsNeedingFallback.has(tid)) continue;
        const v = parseFloat(st.shape_dist_traveled);
        if(!isNaN(v)){
          if(!(tid in tripDistRaw) || v > tripDistRaw[tid]) tripDistRaw[tid] = v;
        }
      }
      const rawVals = Object.values(tripDistRaw).filter(v=>v>0);
      rawVals.sort((a,b)=>a-b);
      const median = rawVals.length ? rawVals[Math.floor(rawVals.length/2)] : 0;
      const isMeters = median > CONFIG.METERS_MEDIAN_THRESHOLD;
      const unitDivisor = isMeters ? 1000 : 1;
      for(const tid in tripDistRaw){
        tripDistKm[tid] = tripDistRaw[tid] / unitDivisor;
        fallbackUsed++;
      }
    }
    const noDistCount = Object.keys(tripInfo).length - Object.keys(tripDistKm).length;

    // Dias ativos por service_id, restringidos ao período do ficheiro
    const periodStart = Utils.toGtfsDate(entry.startDate);
    const periodEnd = Utils.toGtfsDate(entry.endDate);
    const periodDays = Utils.dateRangeDays(entry.startDate, entry.endDate);

    const calByService = {};
    if(calendar){
      for(const c of calendar) calByService[c.service_id] = c;
    }
    const exceptionsByService = {};
    if(calendarDates){
      for(const cd of calendarDates){
        if(!exceptionsByService[cd.service_id]) exceptionsByService[cd.service_id] = {};
        exceptionsByService[cd.service_id][cd.date] = parseInt(cd.exception_type);
      }
    }

    const activeDaysCount = {}; // service_id -> nº de dias ativos no período
    const allServiceIds = new Set([...Object.keys(calByService), ...Object.keys(exceptionsByService)]);

    for(const serviceId of allServiceIds){
      let count = 0;
      const cal = calByService[serviceId];
      const exceptions = exceptionsByService[serviceId] || {};
      for(const day of periodDays){
        const ymd = day.getFullYear().toString() + String(day.getMonth()+1).padStart(2,'0') + String(day.getDate()).padStart(2,'0');
        if(ymd < periodStart || ymd > periodEnd) continue;
        let active = false;
        if(cal && ymd >= cal.start_date && ymd <= cal.end_date){
          const dowName = this.DOW[day.getDay()];
          active = cal[dowName] === '1';
        }
        if(exceptions[ymd] === 1) active = true;   // serviço adicionado
        if(exceptions[ymd] === 2) active = false;  // serviço removido
        if(active) count++;
      }
      activeDaysCount[serviceId] = count;
    }

    // Agregação: km por linha = distância da viagem × dias ativos
    const byRoute = {}; // route_id -> km
    for(const tid in tripInfo){
      const { route_id, service_id } = tripInfo[tid];
      const dist = tripDistKm[tid] || 0; // já em km
      const days = activeDaysCount[service_id] || 0;
      if(dist <= 0 || days <= 0) continue;
      byRoute[route_id] = (byRoute[route_id] || 0) + dist * days;
    }

    const totalKm = Object.values(byRoute).reduce((a,b)=>a+b, 0);

    const frequencies = await this.readCsv(zip, 'frequencies.txt');
    const hasFrequencies = !!(frequencies && frequencies.length > 0);

    return {
      byRoute, routeName, totalKm, days: periodDays.length,
      unit: 'shapes.txt (geodésica WGS84)',
      fallbackUsed, noDistCount, hasFrequencies,
    };
  },
});
