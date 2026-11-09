from fastapi import APIRouter

from .routers import antigravity

api_router_v1 = APIRouter()

api_router_v1.include_router(
    antigravity.antigravity_router, prefix="/antigravity", tags=["Antigravity"]
)
