from fastapi import FastAPI
import os

app = FastAPI(title="Quill API")

@app.get("/api/health")
def health():
    return {"status": "ok"}

@app.get("/api/hello")
def hello(name: str = "world"):
    # Example env usage; database URL available via os.getenv if needed
    return {"message": f"Hello, {name}!"}
