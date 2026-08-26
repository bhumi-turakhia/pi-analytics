from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func

from app.database import engine
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class DataSource(Base):
    __tablename__ = "data_sources"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    source_type = Column(String(50), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
