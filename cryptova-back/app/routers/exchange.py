from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.api_key import ApiKey
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.exchange_schema import (
    ApiKeyCreate,
    ApiKeyDeleteResponse,
    ApiKeySaveResponse,
    ApiKeyStatusResponse,
    ExchangeBalanceResponse,
)
from app.services.encryption_service import EncryptionService
from app.services.bybit_service import BybitService

router = APIRouter(prefix="/exchange", tags=["Exchange"])

encryption_service = EncryptionService()


@router.post("/api-key", response_model=ApiKeySaveResponse)
def save_api_key(
    request: ApiKeyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing_api_key = (
        db.query(ApiKey)
        .filter(ApiKey.user_id == current_user.id)
        .filter(ApiKey.exchange == request.exchange)
        .first()
    )

    encrypted_key = encryption_service.encrypt(request.api_key)
    encrypted_secret = encryption_service.encrypt(request.api_secret)

    if existing_api_key:
        existing_api_key.api_key_encrypted = encrypted_key
        existing_api_key.api_secret_encrypted = encrypted_secret
        existing_api_key.is_testnet = request.is_testnet

        db.commit()
        db.refresh(existing_api_key)

        return {
            "message": "API key updated successfully",
            "registered": True,
            "exchange": existing_api_key.exchange,
            "is_testnet": existing_api_key.is_testnet,
        }

    api_key = ApiKey(
        user_id=current_user.id,
        exchange=request.exchange,
        api_key_encrypted=encrypted_key,
        api_secret_encrypted=encrypted_secret,
        is_testnet=request.is_testnet,
    )

    db.add(api_key)
    db.commit()
    db.refresh(api_key)

    return {
        "message": "API key saved successfully",
        "registered": True,
        "exchange": api_key.exchange,
        "is_testnet": api_key.is_testnet,
    }


@router.get("/api-key/status", response_model=ApiKeyStatusResponse)
def get_api_key_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    api_key = (
        db.query(ApiKey)
        .filter(ApiKey.user_id == current_user.id)
        .filter(ApiKey.exchange == "bybit")
        .first()
    )

    if not api_key:
        return {
            "registered": False,
            "exchange": None,
            "is_testnet": None,
        }

    return {
        "registered": True,
        "exchange": api_key.exchange,
        "is_testnet": api_key.is_testnet,
    }


@router.delete("/api-key", response_model=ApiKeyDeleteResponse)
def delete_api_key(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    api_key = (
        db.query(ApiKey)
        .filter(ApiKey.user_id == current_user.id)
        .filter(ApiKey.exchange == "bybit")
        .first()
    )

    if not api_key:
        return {
            "message": "API key not found",
            "registered": False,
        }

    db.delete(api_key)
    db.commit()

    return {
        "message": "API key deleted successfully",
        "registered": False,
    }

@router.get("/balance", response_model=ExchangeBalanceResponse)
def get_exchange_balance(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    api_key_record = (
        db.query(ApiKey)
        .filter(ApiKey.user_id == current_user.id)
        .filter(ApiKey.exchange == "bybit")
        .first()
    )

    if not api_key_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bybit API key is not registered.",
        )

    try:
        api_key = encryption_service.decrypt(api_key_record.api_key_encrypted)
        api_secret = encryption_service.decrypt(api_key_record.api_secret_encrypted)

        bybit_service = BybitService(
            api_key=api_key,
            api_secret=api_secret,
            is_testnet=api_key_record.is_testnet,
        )

        balance = bybit_service.get_usdt_balance()

        return {
            "exchange": api_key_record.exchange,
            "is_testnet": api_key_record.is_testnet,
            **balance,
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch Bybit balance: {str(e)}",
        )