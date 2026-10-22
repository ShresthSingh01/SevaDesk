from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
from .core.config import settings
from .db.database import init_db
from .api.routes import router

app = FastAPI(
    title="SevaDesk Local Intelligence Core",
    description="Local-first assisted service daemon providing document intelligence, explainable validation, and encrypted storage.",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Loopback endpoints accessed by local Vite frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    init_db()
    # Production mode: serve compiled React SPA from the same process.
    # When dist/ exists, the entire workstation runs on a single Python daemon (~80MB RAM).
    # In dev mode (dist/ absent), the Vite dev server handles the UI — zero disruption.
    dist_path = Path(__file__).parent.parent.parent.parent.parent / "apps" / "workspace" / "dist"
    if dist_path.exists():
        app.mount("/assets", StaticFiles(directory=str(dist_path / "assets")), name="assets")

        @app.get("/app")
        @app.get("/app/{full_path:path}")
        async def serve_spa(full_path: str = ""):
            return FileResponse(str(dist_path / "index.html"))

app.include_router(router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=False)

