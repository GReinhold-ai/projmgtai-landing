from __future__ import annotations

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app_legacy.routes.parse_plans import router as parse_plans_router
from app_legacy.routes.classify import router as classify_router

app = FastAPI(title="ProjMgtAI Backend", version="0.1.0")

# -------------------------
# CORS (Next.js dev)
# -------------------------
cors_env = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
allow_origins = [o.strip() for o in cors_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins if allow_origins else ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------
# Routers
# -------------------------
app.include_router(parse_plans_router)
app.include_router(classify_router)

# -------------------------
# Always-on health endpoint
# -------------------------
@app.get("/health")
def health():
    return {"ok": True, "service": "ProjMgtAI Backend"}

# Optional root
@app.get("/")
def root():
    return {"ok": True, "service": "ProjMgtAI Backend"}
