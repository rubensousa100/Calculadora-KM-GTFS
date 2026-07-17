/* ==========================================================================
 * geo.js — Cálculo geodésico no elipsoide WGS84
 *
 * Fórmula de Vincenty (inversa): distância entre dois pontos no elipsoide.
 * Mais precisa que Haversine (que assume uma esfera) e é a que reproduz os
 * totais de km corretos/esperados para os feeds GTFS testados.
 * ========================================================================== */
'use strict';

const Geo = Object.freeze({

  /**
   * Distância geodésica entre dois pontos (fórmula de Vincenty).
   * @param {{lat:number, lon:number}} p1 - ponto inicial (graus decimais)
   * @param {{lat:number, lon:number}} p2 - ponto final (graus decimais)
   * @returns {number} distância em km
   */
  vincenty(p1, p2){
    const a = 6378137.0;           // raio equatorial WGS84 (m)
    const f = 1 / 298.257223563;   // achatamento WGS84
    const b = (1 - f) * a;
    const L = (p2.lon - p1.lon) * Math.PI / 180;
    const U1 = Math.atan((1 - f) * Math.tan(p1.lat * Math.PI / 180));
    const U2 = Math.atan((1 - f) * Math.tan(p2.lat * Math.PI / 180));
    const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1);
    const sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);

    let lambda = L, lambdaPrev, iterLimit = 200;
    let sinSigma, cosSigma, sigma, sinAlpha, cosSqAlpha, cos2SigmaM;

    do {
      const sinLambda = Math.sin(lambda), cosLambda = Math.cos(lambda);
      sinSigma = Math.sqrt(
        (cosU2 * sinLambda) ** 2 +
        (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2
      );
      if(sinSigma === 0) return 0; // pontos coincidentes
      cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
      sigma = Math.atan2(sinSigma, cosSigma);
      sinAlpha = cosU1 * cosU2 * sinLambda / sinSigma;
      cosSqAlpha = 1 - sinAlpha ** 2;
      cos2SigmaM = cosSqAlpha !== 0 ? cosSigma - 2 * sinU1 * sinU2 / cosSqAlpha : 0;
      const C = f / 16 * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
      lambdaPrev = lambda;
      lambda = L + (1 - C) * f * sinAlpha *
        (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM ** 2)));
    } while(Math.abs(lambda - lambdaPrev) > 1e-12 && --iterLimit > 0);

    const uSq = cosSqAlpha * (a ** 2 - b ** 2) / b ** 2;
    const A = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
    const B = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
    const deltaSigma = B * sinSigma * (cos2SigmaM + B / 4 * (cosSigma * (-1 + 2 * cos2SigmaM ** 2) -
      B / 6 * cos2SigmaM * (-3 + 4 * sinSigma ** 2) * (-3 + 4 * cos2SigmaM ** 2)));
    const s = b * A * (sigma - deltaSigma); // metros

    return s / 1000; // km
  },
});
