/* Flujo guiado de un evento para Coordinación: a partir de los estados REALES que devuelve la API calcula qué pasos están completados, cuál es el actual y
   qué sigue. No inventa estados ni cambia reglas: solo lee. Es lógica pura (sin DOM) para poder probarla fuera del navegador. */

export const PASOS_FLUJO = [
  { clave: 'registro', titulo: 'Registro del evento' },
  { clave: 'necesidades', titulo: 'Revisión de necesidades' },
  { clave: 'propuesta', titulo: 'Elaboración de la propuesta' },
  { clave: 'aceptacion', titulo: 'Aceptación de la propuesta' },
  { clave: 'contrato', titulo: 'Preparación del contrato' },
  { clave: 'politica', titulo: 'Política de no reembolso comunicada' },
  { clave: 'firma', titulo: 'Firma del contrato' },
  { clave: 'anticipo', titulo: 'Anticipo registrado y verificado' },
  { clave: 'confirmacion', titulo: 'Confirmación de la contratación' },
  { clave: 'asignacion', titulo: 'Asignación de proveedores a los servicios' },
  { clave: 'seguimiento', titulo: 'Respuesta de los proveedores' },
  { clave: 'pagofinal', titulo: 'Pago final' },
  { clave: 'cierre', titulo: 'Realización y cierre del evento' },
];

const TERMINALES = ['Cancelado', 'Cerrado sin contratación'];
const CERRADA = 'Cerrada por no aceptación';

/** Contrato que guía el flujo: el último que no se cerró sin confirmar (si solo hay cerrados, el último). */
export function contratoVigente(contratos) {
  const l = contratos || [];
  return [...l].reverse().find((c) => c.estado !== 'Cerrado sin confirmar') || l[l.length - 1] || null;
}

export function calcularFlujo({ estado, propuestas = [], contratos = [], ecs = [], servicios = [] }) {
  const c = contratoVigente(contratos);
  const ec = c ? ecs.find((x) => x.contratoId === c.contratoId) || ecs[0] : ecs[0];
  const hecho = {
    registro: true,
    necesidades: true,
    propuesta: propuestas.some((p) => p.estado !== CERRADA) || contratos.length > 0,
    aceptacion: propuestas.some((p) => p.estado === 'Aceptada') || contratos.length > 0,
    contrato: !!c,
    politica: !!c && !!c.politicaComunicada,
    firma: !!c && (['Firmado', 'Contratación confirmada'].includes(c.estado) || !!c.firmadoEn),
    anticipo: !!ec && ec.anticipo && ec.anticipo.estado === 'Liquidada',
    confirmacion: !!c && c.estado === 'Contratación confirmada',
    asignacion: servicios.length > 0 && servicios.every((s) => !['Sin proveedor asignado', 'Proveedor no disponible'].includes(s.estado)),
    seguimiento: servicios.length > 0 && servicios.every((s) => s.estado === 'Confirmado por el proveedor'),
    pagofinal: !!ec && !!ec.saldoContratoOriginal && ec.saldoContratoOriginal.estado === 'Liquidada',
    cierre: estado === 'Finalizado',
  };
  const terminal = TERMINALES.includes(estado);
  const primero = terminal ? null : PASOS_FLUJO.find((p) => !hecho[p.clave]);
  const pasos = PASOS_FLUJO.map((p) => ({
    ...p,
    estado: hecho[p.clave] ? 'hecho' : (terminal ? 'omitido' : (primero && primero.clave === p.clave ? 'actual' : 'pendiente')),
  }));
  return { pasos, actual: primero ? primero.clave : null, terminal: terminal ? estado : null, contrato: c, estadoCuenta: ec };
}

/** Qué sigue: título, explicación, requisitos que faltan y las acciones (nombres de ACCIONES) que corresponden. */
export function siguientePaso(datos) {
  const f = calcularFlujo(datos);
  const { estado, propuestas = [], servicios = [] } = datos;
  const fmt = datos.fmt || ((x) => x);                     // formato de fechas del navegador (opcional)
  const c = f.contrato; const ec = f.estadoCuenta;
  if (f.terminal) {
    return { clave: null, titulo: f.terminal === 'Cancelado' ? 'El evento está cancelado' : 'El evento se cerró sin contratación', requisitos: [], acciones: [],
      texto: f.terminal === 'Cancelado' ? 'No hay más pasos operativos. Consulta el historial y, si corresponde, la revisión administrativa de pagos y devoluciones.' : 'No se llegó a contratar. Se conserva el historial del evento.' };
  }
  if (!f.actual) return { clave: null, titulo: 'Evento finalizado', texto: 'Todos los pasos del evento están completados.', requisitos: [], acciones: [] };
  const abierta = propuestas.find((p) => ['En elaboración', 'En revisión del Cliente'].includes(p.estado));
  const aceptada = propuestas.find((p) => p.estado === 'Aceptada');
  const faltaAnticipo = !(ec && ec.anticipo && ec.anticipo.estado === 'Liquidada');
  const sinVerificar = !!ec && (ec.pagosRegistrados || []).some((p) => p.estado === 'Registrado');
  switch (f.actual) {
    case 'propuesta':
      return { clave: 'propuesta', titulo: 'Elaborar la propuesta', requisitos: [], acciones: ['crearPropuesta'],
        texto: 'El evento ya está registrado con sus servicios. Elabora la propuesta: elige los proveedores que se consideran para cada servicio, el costo y las condiciones.' };
    case 'aceptacion':
      return { clave: 'aceptacion', titulo: 'Registrar la decisión del Cliente sobre la propuesta', requisitos: [], acciones: ['aceptarPropuesta'], secundarias: ['nuevaVersion', 'cerrarPropuesta'], propuesta: abierta,
        texto: 'La propuesta está en revisión del Cliente. Si la acepta, regístralo; si pide cambios, genera una nueva versión; si no la acepta, ciérrala.' };
    case 'contrato':
      return { clave: 'contrato', titulo: 'Preparar el contrato', requisitos: [], acciones: ['prepararContrato'], propuesta: aceptada,
        texto: 'La propuesta fue aceptada. El siguiente paso es preparar el contrato con la política de no reembolso incluida.' };
    case 'politica':
      return { clave: 'politica', titulo: 'Comunicar la política de no reembolso', requisitos: [], acciones: ['comunicarPolitica'],
        texto: 'El contrato ya está preparado. Antes de la firma hay que comunicar al Cliente la política de no reembolso y registrar cuándo se hizo.' };
    case 'firma':
      return { clave: 'firma', titulo: 'Registrar la firma del contrato', requisitos: [], acciones: ['firmarContrato'],
        texto: `La política de no reembolso ya fue comunicada${c && c.politicaComunicadaEn ? ` (${fmt(c.politicaComunicadaEn)})` : ''}. Cuando el Cliente firme, registra la firma.` };
    case 'anticipo':
      return { clave: 'anticipo', titulo: sinVerificar ? 'Verificar el anticipo registrado' : 'Registrar el anticipo', requisitos: [],
        acciones: sinVerificar ? [] : ['registrarPago'], secundarias: ['seguimientoAnticipo'], verificar: sinVerificar,
        texto: sinVerificar ? 'Hay un pago registrado que todavía no está verificado. Verifícalo desde la tabla de pagos: mientras no se verifique no cuenta como pagado.'
          : 'El contrato está firmado. Registra el anticipo (mínimo 30 % del costo) cuando el Cliente lo pague; el plazo es de 3 días hábiles.' };
    case 'confirmacion':
      return { clave: 'confirmacion', titulo: 'Confirmar la contratación', requisitos: faltaAnticipo ? ['Para confirmar la contratación primero debes verificar el anticipo.'] : [], acciones: faltaAnticipo ? [] : ['confirmarContratacion'],
        texto: 'El anticipo está verificado. La contratación se confirma automáticamente; si no ocurrió, confírmala aquí.' };
    case 'asignacion': {
      const sin = servicios.filter((s) => s.estado === 'Sin proveedor asignado').map((s) => s.servicio);
      const nodisp = servicios.filter((s) => s.estado === 'Proveedor no disponible').map((s) => s.servicio);
      const partes = [sin.length ? `Faltan por asignar: ${sin.join(', ')}. Cada servicio se asigna por separado en «Servicios y proveedores».` : null,
        nodisp.length ? (datos.sustitucionesAbiertas
          ? `El proveedor de ${nodisp.join(', ')} informó que no está disponible y la sustitución ya está abierta. Siguiente paso de la sustitución: ${datos.sustitucionSiguiente || 'proponer un proveedor alternativo'}. Continúa en «Solicitudes del evento».`
          : `El proveedor de ${nodisp.join(', ')} respondió que no está disponible: registra una sustitución de proveedor desde «Solicitudes del evento».`) : null].filter(Boolean);
      const enSolicitudes = nodisp.length > 0 && !sin.length;
      return { clave: 'asignacion', titulo: !enSolicitudes ? 'Asignar un proveedor a cada servicio' : (datos.sustitucionesAbiertas ? 'Continuar la sustitución del proveedor' : 'Sustituir al proveedor que no está disponible'),
        requisitos: estado === 'En organización' ? [] : [`El proveedor se asigna con el evento En organización; ahora está ${estado}.`], acciones: [],
        ancla: enSolicitudes ? 'solicitudes' : 'servicios', anclaTexto: enSolicitudes ? 'Ir a las solicitudes del evento' : 'Ir a servicios y proveedores',
        texto: partes.length ? partes.join(' ') : 'Asigna un proveedor a cada servicio en «Servicios y proveedores».' };
    }
    case 'seguimiento': {
      const pend = servicios.filter((s) => s.estado === 'Pendiente de confirmación del proveedor').map((s) => s.servicio);
      return { clave: 'seguimiento', titulo: 'Esperar la respuesta de los proveedores', requisitos: [], acciones: [], ancla: 'servicios',
        texto: pend.length ? `Pendientes de respuesta: ${pend.join(', ')}. Cada proveedor responde desde su cuenta; si te avisa por teléfono o mensaje, regístralo en «Servicios y proveedores».` : 'Revisa el estado de cada servicio en «Servicios y proveedores».' };
    }
    case 'pagofinal':
      return { clave: 'pagofinal', titulo: 'Registrar el pago final', requisitos: [], acciones: sinVerificar ? [] : ['registrarPago'], verificar: sinVerificar,
        texto: `El pago final (saldo del contrato) vence 7 días antes del evento${ec && ec.saldoContratoOriginal && ec.saldoContratoOriginal.fechaLimite ? ` (${fmt(ec.saldoContratoOriginal.fechaLimite)})` : ''}.` };
    case 'cierre':
      return { clave: 'cierre', titulo: estado === 'En ejecución' ? 'Finalizar el evento' : 'Realización del evento', requisitos: [],
        acciones: estado === 'En ejecución' ? ['finalizarEvento'] : [], texto: estado === 'En ejecución' ? 'El evento ya inició. Cuando termine, registra su finalización.' : 'El inicio y el cierre por fecha los aplica el sistema automáticamente.' };
    default:
      return { clave: f.actual, titulo: 'Continuar', texto: '', requisitos: [], acciones: [] };
  }
}
