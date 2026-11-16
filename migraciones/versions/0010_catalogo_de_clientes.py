"""Catálogo de clientes: tabla `cliente`.

Cambio aditivo: crea una tabla nueva y no modifica ni borra ninguna tabla ni fila existente. `evento.cliente_id` y `propuesta.cliente_id`
siguen guardando el identificador como referencia blanda (sin clave foránea), de modo que los identificadores históricos (p. ej.
«CL-DEMO-01») siguen siendo válidos aunque no figuren en el catálogo. No se crean clientes para los eventos anteriores.

Un cliente se reconoce por su correo normalizado (minúsculas y sin espacios): la restricción única impide dos filas con el mismo correo,
también cuando dos altas simultáneas lo intentan.

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-15
"""
from alembic import op
import sqlalchemy as sa

revision = '0010'
down_revision = '0009'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'cliente',
        sa.Column('cliente_id', sa.Text(), nullable=False),
        sa.Column('nombres', sa.Text(), nullable=False),
        sa.Column('apellidos', sa.Text(), nullable=False),
        sa.Column('telefono', sa.Text(), nullable=False),
        sa.Column('correo', sa.Text(), nullable=False),
        sa.Column('correo_normalizado', sa.Text(), nullable=False),
        sa.Column('registrado_en', sa.DateTime(timezone=False), nullable=False),
        sa.PrimaryKeyConstraint('cliente_id', name=op.f('pk_cliente')),
        sa.UniqueConstraint('correo_normalizado', name=op.f('uq_cliente_correo_normalizado')),
        sa.CheckConstraint("btrim(nombres) <> '' AND btrim(apellidos) <> ''", name=op.f('ck_cliente_nombre_no_vacio')),
        sa.CheckConstraint("btrim(telefono) <> '' AND btrim(correo) <> ''", name=op.f('ck_cliente_contacto_no_vacio')),
        sa.CheckConstraint("correo_normalizado = lower(btrim(correo_normalizado))", name=op.f('ck_cliente_correo_normalizado_canonico')),
    )


def downgrade() -> None:
    # Descarta el catálogo (los eventos y propuestas conservan su cliente_id porque no hay clave foránea).
    op.drop_table('cliente')
