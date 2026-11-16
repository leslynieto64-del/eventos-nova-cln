"""Catálogo de clientes: consultar uno y buscar. El alta no tiene ruta propia: el cliente se reconoce o se registra al registrar su evento
(`POST /eventos`), con un identificador `CL-<uuid>` generado por el servidor. Un cliente inexistente es 404 (`no_encontrado`)."""
from __future__ import annotations
from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from .dependencias import obtener_contenedor
from .esquemas import RechazoRespuesta
from .rutas_comunes import OperacionRespuesta, responder

router = APIRouter(tags=["Clientes (catálogo)"])
_NO_ENCONTRADO = {404: {"model": RechazoRespuesta, "description": "Cliente no encontrado"},
                  422: {"model": RechazoRespuesta, "description": "Rechazo de negocio o entrada no válida"}}


@router.get("/clientes", response_model=OperacionRespuesta, responses=_NO_ENCONTRADO, summary="Consultar y buscar clientes del catálogo")
def listar_clientes(q: str = Query(default="", max_length=200, description="Texto a buscar en identificador, nombre, teléfono o correo"),
                    contenedor=Depends(obtener_contenedor)):
    return responder(contenedor, contenedor.servicios.clientes.listar_clientes(q), despachar=False)


@router.get("/clientes/{cliente_id}", response_model=OperacionRespuesta, responses=_NO_ENCONTRADO, summary="Datos de un cliente del catálogo")
def consultar_cliente(cliente_id: str, contenedor=Depends(obtener_contenedor)):
    resultado = contenedor.servicios.clientes.consultar_cliente(cliente_id)
    if not resultado.exito:
        return JSONResponse(status_code=404, content=RechazoRespuesta(tipo="no_encontrado", detalle=resultado.mensaje).model_dump())
    return responder(contenedor, resultado, despachar=False)
