from contextlib import asynccontextmanager

from elasticsearch import AsyncElasticsearch
from fastapi import FastAPI

from app.core.config import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.es = AsyncElasticsearch(hosts=[get_settings().ELASTICSEARCH_URL])
    yield
    await app.state.es.close()
