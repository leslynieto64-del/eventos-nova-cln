/* Nombres legibles de los eventos («Boda · 12 jun 2027, 18:00 · Ana López»): la interfaz muestra y filtra por nombre; los identificadores solo viajan por dentro. */
import { GET } from './api.js';
import { fmtFechaHora } from './negocio.js';

const cache = new Map();

/** Carga (o recarga) los eventos de una ventana amplia. Si falla, la interfaz sigue funcionando con el texto genérico «Evento». */
export async function cargarNombresEventos() {
  try {
    const r = await GET('/eventos', { desde: '2000-01-01T00:00:00', hasta: '2100-12-31T23:59:59' });
    cache.clear();
    for (const e of r.eventos || []) cache.set(e.eventoId, `${e.tipoEvento} · ${fmtFechaHora(e.fechaHora)}${e.clienteNombre ? ` · ${e.clienteNombre}` : ''}`);
  } catch { /* se conserva lo que hubiera */ }
}

export const nombreEvento = (id) => cache.get(id) || 'Evento';
export const opcionesEventos = () => [...cache].map(([id, texto]) => ({ id, texto })).sort((a, b) => a.texto.localeCompare(b.texto, 'es'));
