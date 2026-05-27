import os

replacements = {
    "Item Code": "SKU Code",
    "ITEM CODE": "SKU CODE",
    "Item Name": "SKU Name",
    "ITEM NAME": "SKU NAME",
    "Product Name": "SKU Name",
    "PRODUCT NAME": "SKU NAME"
}

files = [
    r"d:\Project\DemandPlanner\backend\app\api\import_export.py",
    r"d:\Project\DemandPlanner\frontend\src\app\data-input\import\page.tsx",
    r"d:\Project\DemandPlanner\frontend\src\app\data-input\sales\page.tsx",
    r"d:\Project\DemandPlanner\frontend\src\app\data-input\orders\page.tsx",
    r"d:\Project\DemandPlanner\frontend\src\app\data-input\inventory\page.tsx",
    r"d:\Project\DemandPlanner\frontend\src\app\data-input\forecast\page.tsx",
    r"d:\Project\DemandPlanner\frontend\src\app\master-data\products\page.tsx",
    r"d:\Project\DemandPlanner\frontend\src\app\dashboard\recommendations\page.tsx",
    r"d:\Project\DemandPlanner\frontend\src\app\dashboard\page.tsx",
]

for file_path in files:
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
            
        new_content = content
        for k, v in replacements.items():
            new_content = new_content.replace(k, v)
            
        if new_content != content:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(new_content)
            print(f"Updated {file_path}")
