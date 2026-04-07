from fastapi import FastAPI

app = FastAPI(title="VenueFlow-AI API")

@app.get("/")
async def root():
    return {"message": "Welcome to VenueFlow-AI API"}
