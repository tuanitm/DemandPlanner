"""Seed channels and regions tables from existing partner_groups and warehouses data."""
import pymysql
from datetime import datetime

conn = pymysql.connect(
    host='192.168.30.91', port=3306,
    user='planner', password='planner@2026',
    database='demandplanner', charset='utf8mb4'
)
cur = conn.cursor()

# Check if tables exist
cur.execute("SHOW TABLES LIKE 'channels'")
has_channels = cur.fetchone()
cur.execute("SHOW TABLES LIKE 'regions'")
has_regions = cur.fetchone()
print(f"channels table exists: {bool(has_channels)}")
print(f"regions table exists: {bool(has_regions)}")

# Create tables if needed
if not has_channels:
    cur.execute("""CREATE TABLE channels (
        id INT AUTO_INCREMENT PRIMARY KEY,
        channel_code VARCHAR(50) NOT NULL UNIQUE,
        channel_name VARCHAR(200) NOT NULL,
        status VARCHAR(10) NOT NULL DEFAULT 'Active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX ix_channel_code (channel_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
    print("Created channels table")

if not has_regions:
    cur.execute("""CREATE TABLE regions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        region_code VARCHAR(50) NOT NULL UNIQUE,
        region_name VARCHAR(200) NOT NULL,
        status VARCHAR(10) NOT NULL DEFAULT 'Active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX ix_region_code (region_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
    print("Created regions table")

now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

# Map channel enum/display values to code + display name
channel_map = {
    "Domestic": ("DOM", "Domestic"),
    "Export": ("EXP", "Export"),
    "E-Commerce": ("ECOM", "E-Commerce"),
    "Modern Trade": ("MT", "Modern Trade"),
    "General Trade": ("GT", "General Trade"),
    "Other": ("OTH", "Other"),
    # Also handle SQLAlchemy enum-style values
    "DOMESTIC": ("DOM", "Domestic"),
    "EXPORT": ("EXP", "Export"),
    "ECOMMERCE": ("ECOM", "E-Commerce"),
    "MODERN_TRADE": ("MT", "Modern Trade"),
    "GENERAL_TRADE": ("GT", "General Trade"),
    "OTHER": ("OTH", "Other"),
}

# Get unique channels from partner_groups
cur.execute("SELECT DISTINCT channel FROM partner_groups WHERE channel IS NOT NULL")
existing_channels = [r[0] for r in cur.fetchall()]
print(f"\nChannels in partner_groups: {existing_channels}")

# Seed channels
cur.execute("DELETE FROM channels")
seeded_codes = set()

for ch in existing_channels:
    if ch in channel_map:
        code, name = channel_map[ch]
    else:
        code = ch[:10].upper().replace(" ", "_").replace("-", "")
        name = ch
    if code not in seeded_codes:
        cur.execute(
            "INSERT INTO channels (channel_code, channel_name, status, created_at, updated_at) VALUES (%s, %s, %s, %s, %s)",
            (code, name, "Active", now, now),
        )
        seeded_codes.add(code)
        print(f"  Channel: {code} -> {name}")

# Add remaining standard channels
for _, (code, name) in channel_map.items():
    if code not in seeded_codes:
        cur.execute(
            "INSERT INTO channels (channel_code, channel_name, status, created_at, updated_at) VALUES (%s, %s, %s, %s, %s)",
            (code, name, "Active", now, now),
        )
        seeded_codes.add(code)
        print(f"  Channel: {code} -> {name} (standard)")

# Get unique regions from warehouses
cur.execute("SELECT DISTINCT warehouse_region FROM warehouses WHERE warehouse_region IS NOT NULL ORDER BY warehouse_region")
existing_regions = [r[0] for r in cur.fetchall()]
print(f"\nRegions in warehouses: {existing_regions}")

# Seed regions
cur.execute("DELETE FROM regions")
for region_name in existing_regions:
    code = region_name.upper().replace(" ", "_")[:20]
    cur.execute(
        "INSERT INTO regions (region_code, region_name, status, created_at, updated_at) VALUES (%s, %s, %s, %s, %s)",
        (code, region_name, "Active", now, now),
    )
    print(f"  Region: {code} -> {region_name}")

conn.commit()

# Verify
print("\n=== Final Channels ===")
cur.execute("SELECT id, channel_code, channel_name, status FROM channels ORDER BY id")
for r in cur.fetchall():
    print(f"  {r}")

print("\n=== Final Regions ===")
cur.execute("SELECT id, region_code, region_name, status FROM regions ORDER BY id")
for r in cur.fetchall():
    print(f"  {r}")

conn.close()
print("\nDone!")
