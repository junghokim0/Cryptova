from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.models.user import User
from app.routers import auth


Base.metadata.create_all(bind=engine)


app = FastAPI(
    title="Cryptova Backend API",
    description="Backend server for Cryptova AI crypto trading assistant",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth.router)


@app.get("/")
def root():
    return {"message": "Cryptova Backend API is running"}


@app.get("/health")
def health_check():
    return {"status": "ok"}