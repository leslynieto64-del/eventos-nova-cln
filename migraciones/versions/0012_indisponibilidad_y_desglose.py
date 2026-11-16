"""Reporte de indisponibilidad del proveedor y desglose por servicio de las propuestas.

Cambio aditivo: agrega columnas que admiten NULL; no modifica ni borra ninguna fila existente.
- `sustitucion_proveedor.reporte_*`: el proveedor que ya había aceptado informa que no puede cumplir el servicio (motivo, descripción, fecha, proveedor y fecha en
  que había aceptado). Las sustituciones anteriores quedan sin reporte.
- `version_propuesta.desglose` (JSONB): cotización por servicio (servicio, proveedor, importe) de cada versión. Las versiones anteriores quedan en NULL y conservan
  solo su costo total.

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

revision = '0012'
down_revision = '0011'
branch_labels = None
depends_on = None


def upgrade() -> None:
    for columna, tipo in (('reporte_motivo', sa.Text()), ('reporte_descripcion', sa.Text()), ('reporte_en', sa.DateTime(timezone=False)),
                          ('reporte_proveedor_id', sa.Text()), ('reporte_aceptado_en', sa.DateTime(timezone=False))):
        op.add_column('sustitucion_proveedor', sa.Column(columna, tipo, nullable=True))
    op.add_column('version_propuesta', sa.Column('desglose', pg.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column('version_propuesta', 'desglose')
    for columna in ('reporte_aceptado_en', 'reporte_proveedor_id', 'reporte_en', 'reporte_descripcion', 'reporte_motivo'):
        op.drop_column('sustitucion_proveedor', columna)
