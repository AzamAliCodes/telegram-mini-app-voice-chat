FROM python:3.11-slim

WORKDIR /app

# Install dependencies from existing folder-level files
COPY backend/requirements.txt ./backend_requirements.txt
COPY bot/requirements.txt ./bot_requirements.txt

RUN pip install --no-cache-dir -r backend_requirements.txt
RUN pip install --no-cache-dir -r bot_requirements.txt

# Copy folders
COPY backend/ ./backend/
COPY bot/ ./bot/

# Hugging Face runs on 7860
EXPOSE 7860

# Start both Bot and Backend
CMD python -m bot.main & uvicorn backend.main:app --host 0.0.0.0 --port 7860
