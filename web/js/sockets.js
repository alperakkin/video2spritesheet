let statusSocket = null;
import { updateResults, updateProgress } from "./ui.js";
export function connectStatusSocket(currentJobId) {
    if (statusSocket) {
        statusSocket.close();
        statusSocket = null;
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${protocol}://${window.location.host}/ws/status?job_id=${encodeURIComponent(currentJobId)}`;

    try {
        statusSocket = new WebSocket(url);
    } catch (err) {
        console.error("WebSocket connection error:", err);
        return;
    }

    statusSocket.onmessage = (event) => {
        try {
            const status = JSON.parse(event.data);
            updateProgress(status);
            updateResults(status);
        } catch (err) {
            console.error("Failed to parse WebSocket message:", err);
        }
    };

    statusSocket.onclose = () => {
        statusSocket = null;
    };
}




