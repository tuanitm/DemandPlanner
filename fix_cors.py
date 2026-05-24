import pathlib
import os
import shutil

src = pathlib.Path(r"d:\Project\DemandPlanner\backend\app\config.py")
dst = pathlib.Path(r"d:\Project\DemandPlanner\backend\app\config_fixed.py")

content = src.read_text(encoding="utf-8")

old = 'CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]'
new = 'CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000", "http://192.168.30.90:3000", "http://192.168.30.90"]'

if old in content:
    content = content.replace(old, new)
    # Write to a new file first
    dst.write_text(content, encoding="utf-8")
    # Then try to replace the original
    try:
        os.replace(str(dst), str(src))
        print("SUCCESS: CORS origins updated via os.replace!")
    except PermissionError:
        # Try copy approach
        try:
            os.remove(str(src))
            shutil.move(str(dst), str(src))
            print("SUCCESS: CORS origins updated via remove+move!")
        except PermissionError:
            print(f"FAILED: Cannot replace original file. New file written to: {dst}")
            print("Please manually rename config_fixed.py to config.py")
else:
    # Check if already fixed
    if "192.168.30.90" in content:
        print("ALREADY FIXED: CORS origins already include 192.168.30.90")
    else:
        print("Pattern not found - checking current value:")
        for line in content.splitlines():
            if "CORS" in line:
                print(f"  {line}")
