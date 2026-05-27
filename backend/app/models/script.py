import os

file_path = r'd:\Project\DemandPlanner\backend\app\models\master_data.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

target = '''class StatusType(str, enum.Enum):
    ACTIVE = "Active"
    INACTIVE = "Inactive"'''

replacement = '''class StatusType(str, enum.Enum):
    ACTIVE = "Active"
    INACTIVE = "Inactive"


# ──────────────────────────────────────────────
# Channels and Regions (Master Data)
# ──────────────────────────────────────────────

class Channel(Base):
    __tablename__ = "channels"

    id = Column(Integer, primary_key=True, autoincrement=True)
    channel_code = Column(String(50), unique=True, nullable=False, index=True)
    channel_name = Column(String(200), nullable=False)
    status = Column(Enum(StatusType), default=StatusType.ACTIVE, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Region(Base):
    __tablename__ = "regions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    region_code = Column(String(50), unique=True, nullable=False, index=True)
    region_name = Column(String(200), nullable=False)
    status = Column(Enum(StatusType), default=StatusType.ACTIVE, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)'''

new_content = content.replace(target, replacement)

try:
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Success")
except Exception as e:
    print("Failed:", str(e))
