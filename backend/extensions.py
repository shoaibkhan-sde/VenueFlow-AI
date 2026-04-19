import os
from flask_socketio import SocketIO
from config import Config

# Smart Broker Configuration:
# - In production (Cloud Run), we use Redis to broker between workers.
# - In local development, we skip the broker to allow zero-config startup.
redis_url = os.environ.get("REDIS_URL")
use_broker = Config.FLASK_ENV == "production" or (redis_url is not None and "localhost" not in redis_url)

socketio = SocketIO(
    cors_allowed_origins="*",
    message_queue=Config.REDIS_URL if use_broker else None,
    async_mode='eventlet'
)
