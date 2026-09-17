from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import sources
from app.routes import datasets
from app.routes import pipeline_runs
from app.routes import query
from app.routes import ai as ai_router
from app.routes import copilot as copilot_router
from app.routes import dashboards as dashboards_router
from app.database import init_db_schema

# Initialize metadata catalog tables non-destructively
init_db_schema()

app = FastAPI(
    title="Pi-Analytics API",
    version="1.0.0"
)



# Allow the React frontend to communicate with FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Register API routers
app.include_router(sources.router)
app.include_router(datasets.router)
app.include_router(pipeline_runs.router)
app.include_router(query.router)
app.include_router(ai_router.router)
app.include_router(copilot_router.router)
app.include_router(dashboards_router.router)



@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "pi-analytics-api"
    }