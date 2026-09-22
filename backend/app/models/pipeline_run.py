from sqlalchemy import Column, Integer, String, DateTime, ForeignKey

from sqlalchemy.orm import declarative_base

Base = declarative_base()


class PipelineRun(Base):
    __tablename__ = "pipeline_runs"

    id = Column(Integer, primary_key=True)
    source_id = Column(Integer, ForeignKey("data_sources.id"))
    status = Column(String(50), nullable=False)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    rows_processed = Column(Integer, default=0)
