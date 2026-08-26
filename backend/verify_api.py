import httpx, asyncio

async def test():
    async with httpx.AsyncClient(timeout=15) as c:
        # 1. Health check
        r = await c.get("http://127.0.0.1:8000/api/health")
        print(f"[Health]    {r.status_code} - {r.json()}")

        # 2. Login
        r = await c.post("http://127.0.0.1:8000/api/auth/login", json={"username": "admin", "password": "admin123"})
        print(f"[Login]     {r.status_code}")
        if r.status_code != 200:
            print(f"  Error: {r.text}")
            return
        token = r.json()["access_token"]
        h = {"Authorization": f"Bearer {token}"}

        # 3. Dashboard summary
        r = await c.get("http://127.0.0.1:8000/api/dashboard/summary?view_mode=monthly&year=2026&month=8", headers=h)
        print(f"[Dashboard] {r.status_code}")
        if r.status_code == 200:
            d = r.json()
            kpis = d.get("kpis", [])
            print(f"  KPIs: {len(kpis)} items")
            for k in kpis:
                print(f"    - {k['label']}: {k['value']}")
            print(f"  Sales Plan: {len(d.get('salesPlanData', []))} categories")
            inv = d.get("inventoryStructure", [])
            print(f"  Inventory Structure: {len(inv)} groups")
            for i in inv:
                print(f"    - {i['name']}: {i['value']}%")
            print(f"  Top Selling: {len(d.get('topSellingSKUs', []))} SKUs")
            print(f"  Top Inventory: {len(d.get('topInventorySKUs', []))} SKUs")
        else:
            print(f"  Error: {r.text}")

asyncio.run(test())
