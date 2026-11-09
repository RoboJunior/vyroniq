from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.api import api_router_v1
from app.service.elasticsearch_service import lifespan

# Initalizing the app
app = FastAPI(title="Agent Observability", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Initalizing the health route
@app.get("/health")
async def health():
    return JSONResponse(
        content={"message": "Backend is running successfully"}, status_code=200
    )


app.include_router(api_router_v1, prefix="/v1")
