from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import sources
from app.routes import datasets
from app.routes import pipeline_runs


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


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "pi-analytics-api"
    }