import httpx
import asyncio

async def test_api():
    # Login to get token
    async with httpx.AsyncClient() as client:
        res = await client.post("http://127.0.0.1:8000/api/auth/login", json={"username": "admin", "password": "password"})
        if res.status_code != 200:
            print("Login failed:", res.text)
            return
        token = res.json()["access_token"]
        print("Logged in!")

        # Fetch dashboard summary
        headers = {"Authorization": f"Bearer {token}"}
        res2 = await client.get("http://127.0.0.1:8000/api/dashboard/summary?view_mode=monthly&year=2026&month=8", headers=headers)
        print("Dashboard Summary Status:", res2.status_code)
        print("Response:", res2.text)

if __name__ == "__main__":
    asyncio.run(test_api())
