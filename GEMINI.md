# VenueFlow-AI: GEMINI Instructions

## Project Overview

**VenueFlow-AI** is a project dedicated to enhancing the physical event experience for attendees at large-scale sporting venues. The primary focus is on solving common challenges such as:

*   **Crowd Movement:** Optimizing flow to prevent congestion.
*   **Waiting Times:** Reducing queues for concessions, restrooms, and entry/exit points.
*   **Real-time Coordination:** Providing timely information and updates to attendees and staff.

The ultimate goal is to create a seamless and enjoyable experience for everyone at the venue.

## Tech Stack (Step 2: Architecture Design)

- **Language:** Python
- **Backend Framework:** FastAPI
- **Server:** Uvicorn
- **Validation/Settings:** Pydantic & Pydantic-settings
- **Database (Proposed):** PostgreSQL with SQLAlchemy (Asyncio)
- **Testing:** Pytest

## Directory Overview

- **app/**: Main FastAPI application core.
  - **api/**: API routes and endpoint logic.
  - **core/**: Shared configurations, security, and global constants.
  - **models/**: Database models (SQLAlchemy).
  - **schemas/**: Data validation and serialization models (Pydantic).
  - **crud/**: Create, Read, Update, and Delete operations.
  - **db/**: Database engine and session management.
- **tests/**: Automated test suite.
- **docs/**: Project documentation and architecture diagrams.
- **requirements.txt**: Project dependencies.
- **README.md**: High-level goal and project description.
- **GEMINI.md**: (This file) Provides guidance and context for AI-driven development.

## Usage

### Running the API locally

```bash
uvicorn app.main:app --reload
```

## Development Status (TODO)

*   [x] Define the core technology stack (Python/FastAPI).
*   [ ] Establish build and deployment pipelines.
*   [x] Create a repository structure for source code.
*   [ ] Implement basic CRUD operations for venues and events.
