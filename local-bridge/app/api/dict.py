"""Dictionary lookup router."""

from __future__ import annotations

from fastapi import APIRouter

from app.schemas.models import DictRequest, DictResponse
from app.services.dictionary import is_loaded as dict_loaded
from app.services.dictionary import load_dictionary, lookup

router = APIRouter()


@router.post("/dict", response_model=DictResponse)
def dict_lookup(body: DictRequest) -> DictResponse:
    if not dict_loaded():
        load_dictionary()
    return lookup(
        body.surface,
        lemma=body.lemma or "",
        context_tokens=body.context_tokens or None,
    )
