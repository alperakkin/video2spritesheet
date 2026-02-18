let jobId = null;




import { initDisplays, initUpload, initGenerate } from "./js/ui.js"
import { connectStatusSocket } from "./js/sockets.js";
function setJobId(id) {
    jobId = id;
}

function getJobId() {
    return jobId;
}

initDisplays();
initUpload(setJobId);
initGenerate(getJobId, connectStatusSocket);



