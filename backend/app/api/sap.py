from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.sap_service import sap_service
from app.models.forecasts import User
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/api/sap", tags=["SAP Integration"])

@router.post("/sync-all")
async def sync_all_sap_data(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Triggers a full synchronization from SAP B1 Service Layer to local DB.
    """
    try:
        result = await sap_service.sync_all(db)
        await db.commit()
        return result
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"SAP Sync failed: {str(e)}")
