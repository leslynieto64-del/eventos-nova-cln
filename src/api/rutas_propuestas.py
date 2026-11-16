"""CU-01 (parcial): registrar un evento y crear su propuesta mediante GestionPropuestaService."""
from __future__ import annotations
from datetime import datetime
from typing import Callable
from fastapi import APIRouter, Depends, status
from application.servicios import GestionPropuestaService
from domain.proveedor import separar_servicios
from .dependencias import obtener_servicio_propuestas, obtener_reloj
from .errores import exigir_exito
from .esquemas import (RegistrarEventoEntrada, EventoRegistradoRespuesta, CrearPropuestaEntrada,
                       PropuestaCreadaRespuesta, RechazoRespuesta)

router = APIRouter(tags=["Propuestas (CU-01)"])
_RECHAZO = {422: {"model": RechazoRespuesta, "description": "Rechazo de negocio o entrada no válida"}}


@router.post("/eventos", status_code=status.HTTP_201_CREATED, response_model=EventoRegistradoRespuesta, response_model_exclude_none=True,
             responses=_RECHAZO, summary="Registrar un evento (y reconocer o registrar a su cliente)")
def registrar_evento(entrada: RegistrarEventoEntrada,
                     servicio: GestionPropuestaService = Depends(obtener_servicio_propuestas),
                     reloj: Callable[[], datetime] = Depends(obtener_reloj)):
    """Con `cliente` el servidor reutiliza al cliente que ya tiene ese correo o lo registra con un identificador `CL-<uuid>` generado aquí;
    si el correo existe con otro nombre o teléfono se rechaza (422) sin unir registros. `cliente_id` es la forma anterior, solo por compatibilidad."""
    if entrada.cliente is not None:
        c = entrada.cliente
        r = exigir_exito(servicio.registrar_evento_de_cliente(c.nombres, c.apellidos, c.telefono, c.correo, entrada.datos.a_dominio(),
                                                              separar_servicios(entrada.servicios), reloj()))
        return EventoRegistradoRespuesta(evento_id=r.datos["evento_id"], mensaje=r.mensaje, cliente=r.datos["cliente"], cliente_nuevo=r.datos["clienteNuevo"])
    r = exigir_exito(servicio.registrar_evento(entrada.cliente_id, entrada.datos.a_dominio(), separar_servicios(entrada.servicios)))
    return EventoRegistradoRespuesta(evento_id=r.datos["evento_id"], mensaje=r.mensaje)


@router.post("/eventos/{evento_id}/propuestas", status_code=status.HTTP_201_CREATED,
             response_model=PropuestaCreadaRespuesta, responses=_RECHAZO, summary="Crear la propuesta de un evento")
def crear_propuesta(evento_id: str, entrada: CrearPropuestaEntrada,
                    servicio: GestionPropuestaService = Depends(obtener_servicio_propuestas),
                    reloj: Callable[[], datetime] = Depends(obtener_reloj)):
    r = exigir_exito(servicio.crear_propuesta(evento_id, entrada.a_dominio(), reloj()))
    return PropuestaCreadaRespuesta(propuesta_id=r.datos["propuesta_id"], evento_id=evento_id, mensaje=r.mensaje)
