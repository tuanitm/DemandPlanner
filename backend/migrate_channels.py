import asyncio
import os
import sys

# Add the parent directory to sys.path so we can import 'app'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import select
from app.database import async_session_factory
from app.models.master_data import Channel, PartnerGroup

async def migrate_channels():
    async with async_session_factory() as session:
        # Get all channels
        result = await session.execute(select(Channel))
        channels = result.scalars().all()
        channel_map = {c.channel_name: c.channel_code for c in channels}
        print(f"Loaded {len(channels)} channels. Map: {channel_map}")
        
        # Get all partner groups
        result = await session.execute(select(PartnerGroup))
        groups = result.scalars().all()
        
        updated_count = 0
        skipped_count = 0
        for g in groups:
            if g.channel in channel_map:
                old_channel = g.channel
                g.channel = channel_map[g.channel]
                print(f"Updating PartnerGroup {g.partner_grp_code}: {old_channel} -> {g.channel}")
                updated_count += 1
            else:
                if g.channel in channel_map.values():
                    print(f"PartnerGroup {g.partner_grp_code} already uses channel code: {g.channel}")
                else:
                    print(f"PartnerGroup {g.partner_grp_code} channel '{g.channel}' not found in map!")
                skipped_count += 1
        
        await session.commit()
        print(f"Migrated {updated_count} partner group records. Skipped {skipped_count}.")

if __name__ == "__main__":
    asyncio.run(migrate_channels())
