from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.service.antigravity_service import (
    get_all_events_antigravity,
    get_conversation_events_antigravity,
)

# Initalzing the antigravity router
antigravity_router = APIRouter()


# Post event to push all the messages to elastic search
@antigravity_router.post("/events")
async def ingest_events(request: Request):
    event = await request.json()
    es = request.app.state.es
    response = await es.index(index="antigravity-events", document=event)
    return {"status": "success", "id": response["_id"]}


# get all events from antigravity
@antigravity_router.get("/get/all/events")
async def get_all_events(request: Request, skip: int = 0, limit: int = 50):
    all_events = await get_all_events_antigravity(
        es=request.app.state.es, skip=skip, limit=limit
    )
    return JSONResponse(content=all_events, status_code=200)


# get all events by conversation id
@antigravity_router.get("/get/{conversation_id}/events")
async def get_conversation_events(
    request: Request, conversation_id: str, skip: int = 0, limit: int = 50
):
    conversation_events = await get_conversation_events_antigravity(
        es=request.app.state.es, conversation_id=conversation_id, skip=skip, limit=limit
    )
    return JSONResponse(content=conversation_events, status_code=200)
