import asyncio
import os
import sys

# Add the parent directory to sys.path so we can import 'app'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import select
from app.database import async_session_factory
from app.models.master_data import Brand, ProductHierarchy

async def migrate_brands():
    async with async_session_factory() as session:
        # Get all brands
        result = await session.execute(select(Brand))
        brands = result.scalars().all()
        brand_map = {b.brand_name: b.brand_code for b in brands}
        print(f"Loaded {len(brands)} brands. Map: {brand_map}")
        
        # Get all product hierarchies
        result = await session.execute(select(ProductHierarchy))
        hierarchies = result.scalars().all()
        
        updated_count = 0
        skipped_count = 0
        for h in hierarchies:
            if h.brand in brand_map:
                old_brand = h.brand
                h.brand = brand_map[h.brand]
                print(f"Updating ProductHierarchy {h.item_group_code}: {old_brand} -> {h.brand}")
                updated_count += 1
            else:
                if h.brand in brand_map.values():
                    print(f"ProductHierarchy {h.item_group_code} already uses brand code: {h.brand}")
                else:
                    print(f"ProductHierarchy {h.item_group_code} brand '{h.brand}' not found in map!")
                skipped_count += 1
        
        await session.commit()
        print(f"Migrated {updated_count} product hierarchy records. Skipped {skipped_count}.")

if __name__ == "__main__":
    asyncio.run(migrate_brands())
