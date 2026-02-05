# app/main.py
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os, time

from app.routes.parse_plans import router as parse_router  # ✅ use your route

def _parse_origins(val: str) -> list[str]:
    return [o.strip() for o in val.split(",") if o.strip()]

ALLOWED_ORIGINS = _parse_origins(
    os.getenv("ALLOWED_ORIGINS", "http://127.0.0.1:3000,http://localhost:3000")
)

app = FastAPI(title="ProjMgtAI Backend", version="0.1.0", docs_url="/docs", redoc_url="/redoc")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET","POST","OPTIONS"],
    allow_headers=["Authorization","Content-Type","X-User-Id","X-Plan"],  # ✅
)

@app.middleware("http")
async def timing_logger(request: Request, call_next):
    start = time.time()
    try:
        resp = await call_next(request)
        return resp
    except Exception:
        return JSONResponse({"error": "internal_error"}, status_code=500)
    finally:
        dur = (time.time() - start) * 1000
        print(f"{request.method} {request.url.path} took {dur:.1f}ms")

@app.get("/")
def root(): return {"status":"ok","service":"ProjMgtAI Backend","version":app.version}
@app.get("/healthz")
def healthz(): return {"ok": True}

app.include_router(parse_router)  # ✅ exposes /analyze/parse_plans
