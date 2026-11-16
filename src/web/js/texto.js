/* Utilidades de texto sin dependencias del navegador (se pueden probar con Node).
   - sinVacios: descarta null, undefined y false antes de añadir hijos a un elemento (el DOM convertiría null en el texto «null»).
   - humanizar: quita de un mensaje del sistema las referencias internas a requisitos (BN-…, CA-…, GL-…, SE-…, etc.) y deja el motivo.
     Los identificadores de datos (EV-…, PV-…, CT-…, SC-…) NO se tocan. El texto original sigue disponible en «Detalles técnicos». */

const PREFIJOS = '(?:BN|CA|GL|SE|US|CU|RN|AR|TP|ADR|[ACDEHR])';
const CODIGO = new RegExp(`\\b${PREFIJOS}-\\d{1,3}[A-Za-z]?\\b(?!-)`, 'g');
const PARENTESIS = /\s*\(([^()]*)\)/g;

export const sinVacios = (...hijos) => hijos.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false);

/** Un paréntesis se quita solo si, sin los códigos, no queda contenido («(CA-029, CA-031)», «(BN-005 y CA-027)», «(decisión E-3)»). */
function soloCodigos(contenido) {
  if (!new RegExp(CODIGO.source).test(contenido)) return false;
  const resto = contenido.replace(CODIGO, '').replace(/\b(?:decisión|decisiones|regla|reglas|criterio|criterios|requisito|a|y|e|o)\b/gi, '');
  return /^[\s,;/·.\-–—]*$/.test(resto);
}

export function humanizar(texto) {
  if (texto === null || texto === undefined) return texto;
  let t = String(texto).replace(PARENTESIS, (m, dentro) => (soloCodigos(dentro) ? '' : m));
  // Códigos que quedaron sueltos (por ejemplo «según CA-029»): se retiran junto con la expresión que los introduce.
  const suelto = String.raw`${PREFIJOS}-\d{1,3}[A-Za-z]?\b(?!-)`;
  t = t.replace(new RegExp(String.raw`\s*(?:\b(?:según|conforme a|de acuerdo con|ver)\s+)?\b${suelto}(?:\s*(?:,|y|e|a)\s*\b${suelto})*`, 'g'), '');
  return t.replace(/\s+([.,;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

/** Mensajes de rechazo del sistema que se explican mejor para quien usa la aplicación (qué pasó y qué sigue). Solo reemplaza coincidencias exactas; el resto se deja tal cual. */
const EXPLICACIONES = [
  [/^La propuesta está Aceptada\.?$/, 'La propuesta ya fue aceptada. Siguiente paso: preparar el contrato desde el detalle del evento.'],
  [/^La propuesta está Cerrada por no aceptación\.?$/, 'La propuesta fue cerrada por no aceptación y se conserva su historial.'],
  [/^Ya existe un contrato activo para el evento\.?$/, 'El contrato ya fue preparado. Puedes consultarlo desde el detalle del evento.'],
  [/^Solo un contrato En preparación puede firmarse\.?$/, 'El contrato ya fue firmado o ya no está en preparación. Revisa su estado en la sección Contratación del evento.'],
  [/^Requisitos pendientes para confirmar la contratación\.?$/, 'Todavía no se puede confirmar la contratación: faltan los requisitos que se indican abajo.'],
  [/^anticipo del 30 % registrado y verificado$/i, 'Para confirmar la contratación primero debes registrar y verificar el anticipo del 30 %.'],
];
export function explicar(texto) {
  if (texto === null || texto === undefined) return texto;
  const t = String(texto).trim();
  for (const [patron, claro] of EXPLICACIONES) if (patron.test(t)) return claro;
  return texto;
}

/** Teléfono: exactamente 10 dígitos numéricos. La misma regla se aplica en el servidor (src/domain/telefono.py). */
export const MENSAJE_TELEFONO = 'El número telefónico debe contener exactamente 10 dígitos';
export const telefonoValido = (v) => /^[0-9]{10}$/.test(String(v === null || v === undefined ? '' : v).trim());
export const soloDigitos = (v) => String(v === null || v === undefined ? '' : v).replace(/[^0-9]/g, '');

/** ¿Queda alguna referencia interna en el texto? (para pruebas). */
export const tieneCodigoInterno = (texto) => new RegExp(CODIGO.source).test(String(texto));
