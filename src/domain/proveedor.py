"""Catálogo de Proveedores (registro de las personas o empresas que prestan servicios en los eventos).

El BRD define al Proveedor como «persona o empresa encargada de proporcionar alguno de los servicios necesarios para el evento»
y pide conocer qué proveedores están asignados a cada evento (BN-004), pero no especifica sus atributos. Por eso el registro es
mínimo y no inventa datos: identificador, nombre (obligatorio), contacto (texto libre, opcional) y los servicios que ofrece
(opcional). No tiene tarifas, condiciones contractuales ni calendario: esos datos siguen viniendo del puerto de disponibilidad.

Es un registro de referencia, no una raíz de agregado con máquina de estados: no emite Domain Events ni se versiona."""
from __future__ import annotations
import re
import unicodedata
from dataclasses import dataclass, replace
from datetime import datetime
from typing import Iterable, Optional, Tuple
from .telefono import validar_telefono
from .valores import ErrorDominio


def normalizar_texto(texto: str) -> str:
    """Minúsculas, sin acentos y con espacios colapsados: para comparar nombres y servicios («Música» == «musica»)."""
    sin_acentos = "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")
    return " ".join(sin_acentos.lower().split())


# Equivalencias EXPLÍCITAS entre nombres de servicio (forma normalizada → forma canónica). No hay coincidencia aproximada: un nombre que no figura
# aquí solo equivale a sí mismo (sin mayúsculas, acentos ni espacios de más). Ampliar la tabla es una decisión de negocio, no un ajuste automático.
EQUIVALENCIAS_DE_SERVICIOS = {
    "banquetes": "banquete", "salones": "salon", "musicas": "musica", "fotografias": "fotografia",
    "decoraciones": "decoracion", "invitaciones": "invitacion", "transportes": "transporte", "meseros": "mesero",
}


def normalizar_servicio(texto: str) -> str:
    """Forma canónica de un nombre de servicio para compararlo: «Banquetes», « banquete » y «BANQUETE» son el mismo servicio; «Música» y «musica» también."""
    n = normalizar_texto(texto)
    return EQUIVALENCIAS_DE_SERVICIOS.get(n, n)


def separar_servicios(servicios) -> list:
    """Separa por «;» o «,» los servicios escritos en una sola cadena («Banquete; Música» → «Banquete», «Música») y quita vacíos y repetidos
    (por su forma canónica). Conserva el orden y la grafía de la primera aparición."""
    vistos, salida = set(), []
    for s in servicios or []:
        for parte in re.split(r"[;,]", s or ""):
            limpio = " ".join(parte.split())
            clave = normalizar_servicio(limpio)
            if limpio and clave not in vistos:
                vistos.add(clave)
                salida.append(limpio)
    return salida


@dataclass(frozen=True)
class Proveedor:
    proveedor_id: str
    nombre: str
    servicios: Tuple[str, ...]
    contacto: str
    registrado_en: datetime
    activo: bool = True          # un proveedor desactivado conserva su historial, pero no se propone para asignaciones nuevas
    telefono: str = ""           # opcional; si se captura, exactamente 10 dígitos (los proveedores anteriores no lo tienen y el contacto sigue siendo texto libre)

    def __post_init__(self):
        if not self.proveedor_id or not self.proveedor_id.strip():
            raise ErrorDominio("El proveedor debe tener un identificador.")
        if not self.nombre or not self.nombre.strip():
            raise ErrorDominio("Debe indicarse el nombre del proveedor.")
        if any(not s or not s.strip() for s in self.servicios):
            raise ErrorDominio("Los servicios del proveedor no pueden estar vacíos.")

    @staticmethod
    def registrar(proveedor_id: str, nombre: str, servicios: Iterable[str], contacto: str, ahora: datetime, telefono: str = "") -> "Proveedor":
        vistos, unicos = set(), []
        for s in servicios:
            limpio = " ".join((s or "").split())
            if limpio and normalizar_texto(limpio) not in vistos:
                vistos.add(normalizar_texto(limpio)); unicos.append(limpio)
        tel = validar_telefono(telefono) if (telefono or "").strip() else ""
        return Proveedor(proveedor_id, " ".join((nombre or "").split()), tuple(unicos), (contacto or "").strip(), ahora, telefono=tel)

    def con_datos(self, nombre: str, servicios: Iterable[str], contacto: str, telefono: Optional[str] = None) -> "Proveedor":
        """Mismo proveedor (misma identidad y fecha de registro) con los datos corregidos; se validan igual que en el alta.
        `telefono` None conserva el actual; una cadena vacía lo quita; cualquier otro valor debe tener exactamente 10 dígitos."""
        nuevo = Proveedor.registrar(self.proveedor_id, nombre, servicios, contacto, self.registrado_en, self.telefono if telefono is None else telefono)
        return replace(nuevo, activo=self.activo)

    def con_actividad(self, activo: bool) -> "Proveedor":
        return replace(self, activo=activo)

    @property
    def nombre_normalizado(self) -> str:
        return normalizar_texto(self.nombre)

    def ofrece(self, servicio: str) -> bool:
        return normalizar_servicio(servicio) in {normalizar_servicio(s) for s in self.servicios}

    def coincide_con(self, busqueda: str) -> bool:
        """Búsqueda por texto en el identificador, el nombre, el contacto y los servicios (sin distinguir mayúsculas ni acentos)."""
        q = normalizar_texto(busqueda)
        if not q:
            return True
        return any(q in normalizar_texto(t) for t in (self.proveedor_id, self.nombre, self.contacto, *self.servicios))
