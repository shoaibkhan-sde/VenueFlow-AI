import { io } from "socket.io-client";
import { getAuthToken } from "./auth";

// "undefined" means the URL will be computed from the `window.location` object
const URL = import.meta.env.PROD ? undefined : "http://localhost:5000";

const token = await getAuthToken();

export const socket = io(URL, {
  autoConnect: true,
  auth: {
    token: token
  }
});
