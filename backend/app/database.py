import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()
if not os.getenv("DATABASE_URL"):
    env_backend = os.path.join(os.path.dirname(__file__), "..", ".env")
    if os.path.exists(env_backend):
        load_dotenv(env_backend)

DATABASE_URL = os.getenv("DATABASE_URL")

print("DATABASE_URL loaded:", DATABASE_URL is not None)

engine = create_engine(DATABASE_URL)


def check_database_connection():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


def init_db_schema():
    """Ensure catalog metadata tables and columns exist idempotently without destructive changes."""
    try:
        with engine.begin() as conn:
            conn.execute(text("""
                ALTER TABLE datasets ADD COLUMN IF NOT EXISTS row_count BIGINT DEFAULT 0;
                ALTER TABLE datasets ADD COLUMN IF NOT EXISTS table_type VARCHAR(50) DEFAULT 'TABLE';
                ALTER TABLE datasets ADD COLUMN IF NOT EXISTS size_bytes BIGINT DEFAULT 0;
                ALTER TABLE datasets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

                CREATE UNIQUE INDEX IF NOT EXISTS uq_datasets_source_db_schema_table 
                ON datasets (source_id, database_name, schema_name, table_name);

                CREATE TABLE IF NOT EXISTS catalog_columns (
                    id SERIAL PRIMARY KEY,
                    dataset_id INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
                    column_name VARCHAR(255) NOT NULL,
                    data_type VARCHAR(100) NOT NULL,
                    is_nullable BOOLEAN DEFAULT TRUE,
                    ordinal_position INTEGER NOT NULL DEFAULT 0,
                    comment TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT uq_catalog_columns_dataset_col UNIQUE (dataset_id, column_name)
                );

                CREATE INDEX IF NOT EXISTS idx_catalog_columns_dataset_id ON catalog_columns(dataset_id);

                CREATE TABLE IF NOT EXISTS dashboards (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    source_id INTEGER REFERENCES data_sources(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS dashboard_widgets (
                    id SERIAL PRIMARY KEY,
                    dashboard_id INTEGER NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
                    title VARCHAR(255) NOT NULL,
                    widget_type VARCHAR(50) NOT NULL,
                    source_id INTEGER REFERENCES data_sources(id) ON DELETE SET NULL,
                    database_name VARCHAR(255),
                    schema_name VARCHAR(255),
                    table_name VARCHAR(255),
                    sql_query TEXT NOT NULL,
                    visualization_spec JSONB NOT NULL DEFAULT '{}'::jsonb,
                    position INTEGER DEFAULT 0,
                    width INTEGER DEFAULT 6,
                    height INTEGER DEFAULT 4,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_dashboard_id ON dashboard_widgets(dashboard_id);
            """))
    except Exception as e:
        print("Schema initialization notice:", e)