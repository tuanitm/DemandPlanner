import os

file_path = r'd:\Project\DemandPlanner\backend\app\models\transactions.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

target = '''    warehouse_code = Column(
        String(50),
        ForeignKey("warehouses.warehouse_code", ondelete="RESTRICT"),
        nullable=False,
    )'''

replacement = '''    sku_name = Column(String(500), nullable=True)'''

new_content = content.replace(target, replacement)

try:
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Success")
except Exception as e:
    print("Failed:", str(e))
