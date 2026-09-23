from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
import os
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, EmailStr
from sqlalchemy import text

from app.database import engine

router = APIRouter(prefix="/api/auth", tags=["auth"])

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET is not configured in the backend environment.")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


def create_token(user_id: int, email: str) -> str:
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_user_from_token(authorization: str):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")

    token = authorization.split(" ", 1)[1]

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, ValueError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    with engine.connect() as conn:
        user = conn.execute(
            text(
                "SELECT id, name, email, role FROM users WHERE id = :user_id"
            ),
            {"user_id": user_id},
        ).mappings().first()

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return dict(user)


@router.post("/register")
def register(payload: RegisterRequest):
    if len(payload.password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters long",
        )

    password_hash = bcrypt.hashpw(
        payload.password.encode("utf-8"),
        bcrypt.gensalt(),
    ).decode("utf-8")

    with engine.connect() as conn:
        existing = conn.execute(
            text("SELECT id FROM users WHERE LOWER(email) = LOWER(:email)"),
            {"email": payload.email},
        ).first()

        if existing:
            raise HTTPException(
                status_code=409,
                detail="An account with this email already exists",
            )

        result = conn.execute(
            text(
                """
                INSERT INTO users (name, email, password_hash)
                VALUES (:name, :email, :password_hash)
                RETURNING id, name, email, role
                """
            ),
            {
                "name": payload.name.strip(),
                "email": payload.email.lower(),
                "password_hash": password_hash,
            },
        )

        user = dict(result.mappings().first())
        conn.commit()

    token = create_token(user["id"], user["email"])

    return {
        "success": True,
        "message": "Account created successfully",
        "token": token,
        "user": user,
    }


@router.post("/login")
def login(payload: LoginRequest):
    with engine.connect() as conn:
        user = conn.execute(
            text(
                """
                SELECT id, name, email, password_hash, role
                FROM users
                WHERE LOWER(email) = LOWER(:email)
                """
            ),
            {"email": payload.email},
        ).mappings().first()

    if not user or not bcrypt.checkpw(
        payload.password.encode("utf-8"),
        user["password_hash"].encode("utf-8"),
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )

    token = create_token(user["id"], user["email"])

    return {
        "success": True,
        "message": "Login successful",
        "token": token,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "role": user["role"],
        },
    }


@router.get("/me")
def me(authorization: str = Header(default="")):
    return {
        "success": True,
        "user": get_user_from_token(authorization),
    }


@router.post("/logout")
def logout():
    return {
        "success": True,
        "message": "Logged out successfully",
    }



